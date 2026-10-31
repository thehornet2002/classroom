import { RTC_CONFIG } from "./stunServers";
import { useRoomStore } from "../stores/roomStore";
import { WSMessage } from "../types";

export class WebRTCManager {
  private peers = new Map<string, RTCPeerConnection>();
  private sendWSMessage: (msg: WSMessage) => void = () => {};
  private localStream: MediaStream | null = null;
  private localAudioStream: MediaStream | null = null;

  setSendFunction(fn: (msg: WSMessage) => void) {
    this.sendWSMessage = fn;
  }

  setLocalStreams(videoStream: MediaStream | null, audioStream: MediaStream | null) {
    this.localStream = videoStream;
    this.localAudioStream = audioStream;

    // Update existing peer connections with new tracks
    for (const [peerId, pc] of this.peers.entries()) {
      const senders = pc.getSenders();
      senders.forEach((sender) => {
        try {
          pc.removeTrack(sender);
        } catch (e) {}
      });

      if (videoStream) {
        videoStream.getTracks().forEach((track) => {
          pc.addTrack(track, videoStream);
        });
      }
      if (audioStream) {
        audioStream.getTracks().forEach((track) => {
          pc.addTrack(track, audioStream);
        });
      }

      // Renegotiate with peer if we are broadcasting
      this.renegotiate(peerId, pc);
    }
  }

  hasPeer(peerId: string): boolean {
    return this.peers.has(peerId);
  }

  private async renegotiate(peerId: string, pc: RTCPeerConnection) {
    const currentUser = useRoomStore.getState().currentUser;
    if (!currentUser || pc.signalingState !== "stable") return;
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      this.sendWSMessage({
        type: "SIGNAL_OFFER",
        targetId: peerId,
        senderId: currentUser.id,
        sdp: offer,
      });
    } catch (e) {
      console.error("Renegotiate error with peer", peerId, e);
    }
  }

  private createPeerConnection(peerId: string): RTCPeerConnection {
    const existing = this.peers.get(peerId);
    if (existing) return existing;

    const pc = new RTCPeerConnection(RTC_CONFIG);
    this.peers.set(peerId, pc);

    const currentUser = useRoomStore.getState().currentUser;

    // Attach local tracks if present
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        pc.addTrack(track, this.localStream!);
      });
    }
    if (this.localAudioStream) {
      this.localAudioStream.getTracks().forEach((track) => {
        pc.addTrack(track, this.localAudioStream!);
      });
    }

    pc.onicecandidate = (event) => {
      if (event.candidate && currentUser) {
        this.sendWSMessage({
          type: "SIGNAL_ICE",
          targetId: peerId,
          senderId: currentUser.id,
          candidate: event.candidate.toJSON(),
        });
      }
    };

    pc.ontrack = (event) => {
      const stream = event.streams[0] || new MediaStream([event.track]);
      useRoomStore.getState().setRemoteStream(peerId, stream);
    };

    pc.onconnectionstatechange = () => {
      if (
        pc.connectionState === "disconnected" ||
        pc.connectionState === "failed" ||
        pc.connectionState === "closed"
      ) {
        this.closePeer(peerId);
      }
    };

    return pc;
  }

  async connectToPeer(peerId: string) {
    const currentUser = useRoomStore.getState().currentUser;
    if (!currentUser || peerId === currentUser.id) return;

    const existing = this.peers.get(peerId);
    if (existing && existing.signalingState !== "stable") return;

    const pc = this.createPeerConnection(peerId);
    if (pc.signalingState !== "stable") return;

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      this.sendWSMessage({
        type: "SIGNAL_OFFER",
        targetId: peerId,
        senderId: currentUser.id,
        sdp: offer,
      });
    } catch (e) {
      console.error("Failed to connect to peer", peerId, e);
    }
  }

  async handleOffer(senderId: string, sdp: RTCSessionDescriptionInit) {
    const currentUser = useRoomStore.getState().currentUser;
    if (!currentUser) return;

    const pc = this.createPeerConnection(senderId);
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      this.sendWSMessage({
        type: "SIGNAL_ANSWER",
        targetId: senderId,
        senderId: currentUser.id,
        sdp: answer,
      });
    } catch (e) {
      console.error("Failed to handle offer from", senderId, e);
    }
  }

  async handleAnswer(senderId: string, sdp: RTCSessionDescriptionInit) {
    const pc = this.peers.get(senderId);
    if (pc) {
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      } catch (e) {
        console.error("Failed to handle answer from", senderId, e);
      }
    }
  }

  async handleIceCandidate(senderId: string, candidate: RTCIceCandidateInit) {
    const pc = this.peers.get(senderId);
    if (pc) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.error("Failed to add ICE candidate from", senderId, e);
      }
    }
  }

  closePeer(peerId: string) {
    const pc = this.peers.get(peerId);
    if (pc) {
      pc.close();
      this.peers.delete(peerId);
    }
    useRoomStore.getState().setRemoteStream(peerId, null);
  }

  closeAll() {
    for (const [peerId, pc] of this.peers.entries()) {
      pc.close();
      useRoomStore.getState().setRemoteStream(peerId, null);
    }
    this.peers.clear();
  }
}

export const webrtc = new WebRTCManager();
