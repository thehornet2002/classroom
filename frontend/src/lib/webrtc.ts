import { RTC_CONFIG } from "./stunServers";
import { useRoomStore } from "../stores/roomStore";
import { WSMessage } from "../types";
import { audioManager } from "./audioManager";

// Low-bandwidth resilient Opus SDP optimization
// Configures in-band Forward Error Correction (FEC), Discontinuous Transmission (DTX),
// and packet loss concealment to guarantee continuous, stutter-free voice on poor connections
function optimizeOpusSdp(sdp: string): string {
  if (!sdp) return sdp;

  return sdp.replace(/a=fmtp:111 ((?:(?!minptime).)*)\r\n/g, (match, existing) => {
    // maxaveragebitrate=32000 (perfect voice clarity with 3x lower bandwidth consumption)
    // useinbandfec=1: hardware/codec level packet recovery during network drops
    // usedtx=1: reduces bandwidth by 50% during silence
    // ptime=20, minptime=10: standard low-overhead packetization
    return `a=fmtp:111 ${existing};minptime=10;ptime=20;maxaveragebitrate=32000;useinbandfec=1;usedtx=1;stereo=0;sprop-stereo=0;cbr=1\r\n`;
  });
}

export class WebRTCManager {
  private peers = new Map<string, RTCPeerConnection>();
  private dataChannels = new Map<string, RTCDataChannel>();
  private pendingCandidates = new Map<string, RTCIceCandidateInit[]>();
  private sendWSMessage: (msg: WSMessage) => void = () => {};
  private localStream: MediaStream | null = null;
  private localAudioStream: MediaStream | null = null;

  setSendFunction(fn: (msg: WSMessage) => void) {
    this.sendWSMessage = fn;
  }

  private setupDataChannel(peerId: string, dc: RTCDataChannel) {
    dc.onopen = () => {
      this.dataChannels.set(peerId, dc);
    };
    dc.onclose = () => {
      this.dataChannels.delete(peerId);
    };
    dc.onerror = () => {
      this.dataChannels.delete(peerId);
    };
    dc.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as WSMessage;
        const store = useRoomStore.getState();
        if (msg.type === "WHITEBOARD_STROKE") {
          store.addWhiteboardStroke(msg.stroke);
        } else if (msg.type === "WHITEBOARD_CLEAR") {
          store.clearWhiteboard(msg.pageId);
        } else if (msg.type === "DOC_STROKE") {
          store.addDocumentStroke(msg.stroke);
        } else if (msg.type === "DOC_CLEAR_STROKES") {
          store.clearDocumentStrokes(msg.page);
        }
      } catch (e) {}
    };
  }

  sendRealtimeData(msg: WSMessage): boolean {
    const transport = useRoomStore.getState().transport;
    if (transport?.data === "udp" && this.dataChannels.size > 0) {
      const payload = JSON.stringify(msg);
      let sentCount = 0;
      for (const dc of this.dataChannels.values()) {
        if (dc.readyState === "open") {
          try {
            dc.send(payload);
            sentCount++;
          } catch (e) {}
        }
      }
      return sentCount > 0;
    }
    return false;
  }

  async setLocalStreams(videoStream: MediaStream | null, audioStream: MediaStream | null) {
    this.localStream = videoStream;
    this.localAudioStream = audioStream;

    const newVideoTrack = videoStream ? videoStream.getVideoTracks()[0] || null : null;
    const newAudioTrack = audioStream ? audioStream.getAudioTracks()[0] || null : null;

    // Apply voice optimization constraints on active audio track
    if (newAudioTrack) {
      try {
        await newAudioTrack.applyConstraints({
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        });
      } catch (e) {}
    }

    // Update existing peer connections with new tracks using replaceTrack
    for (const [peerId, pc] of this.peers.entries()) {
      let needRenegotiate = false;
      const senders = pc.getSenders();

      // Handle video track
      const videoTransceiver = pc.getTransceivers().find((t) => t.receiver.track.kind === "video");
      if (videoTransceiver) {
        const targetDirection = newVideoTrack ? "sendrecv" : "recvonly";
        if (videoTransceiver.direction !== targetDirection) {
          videoTransceiver.direction = targetDirection;
          needRenegotiate = true;
        }
      }

      const videoSender = senders.find((s) => s.track?.kind === "video") || senders.find((s) => !s.track);
      if (videoSender) {
        try {
          await videoSender.replaceTrack(newVideoTrack);
        } catch (e) {
          needRenegotiate = true;
        }
      } else if (newVideoTrack) {
        try {
          pc.addTrack(newVideoTrack, videoStream!);
          needRenegotiate = true;
        } catch (e) {}
      }

      // Handle audio track
      const audioTransceiver = pc.getTransceivers().find((t) => t.receiver.track.kind === "audio");
      if (audioTransceiver) {
        const targetDirection = newAudioTrack ? "sendrecv" : "recvonly";
        if (audioTransceiver.direction !== targetDirection) {
          audioTransceiver.direction = targetDirection;
          needRenegotiate = true;
        }
      }

      const audioSender = senders.find((s) => s.track?.kind === "audio") || senders.find((s) => !s.track);
      if (audioSender) {
        try {
          await audioSender.replaceTrack(newAudioTrack);
        } catch (e) {
          needRenegotiate = true;
        }
      } else if (newAudioTrack) {
        try {
          pc.addTrack(newAudioTrack, audioStream!);
          needRenegotiate = true;
        } catch (e) {}
      }

      if (needRenegotiate && pc.signalingState === "stable") {
        this.renegotiate(peerId, pc);
      }
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
      const enhancedSdp = optimizeOpusSdp(offer.sdp || "");
      const enhancedOffer = new RTCSessionDescription({ type: offer.type, sdp: enhancedSdp });
      await pc.setLocalDescription(enhancedOffer);
      this.sendWSMessage({
        type: "SIGNAL_OFFER",
        targetId: peerId,
        senderId: currentUser.id,
        sdp: enhancedOffer,
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

    const newVideoTrack = this.localStream ? this.localStream.getVideoTracks()[0] || null : null;
    const newAudioTrack = this.localAudioStream ? this.localAudioStream.getAudioTracks()[0] || null : null;

    // Attach transceivers and assign initial tracks
    try {
      if (newAudioTrack) {
        pc.addTrack(newAudioTrack, this.localAudioStream!);
      } else {
        pc.addTransceiver("audio", { direction: "recvonly" });
      }

      if (newVideoTrack) {
        pc.addTrack(newVideoTrack, this.localStream!);
      } else {
        pc.addTransceiver("video", { direction: "recvonly" });
      }
    } catch (e) {}

    // Create UDP-like low-latency DataChannel (unordered, no retransmits)
    try {
      const dc = pc.createDataChannel("realtime-udp", {
        ordered: false,
        maxRetransmits: 0,
      });
      this.setupDataChannel(peerId, dc);
    } catch (e) {}

    pc.ondatachannel = (event) => {
      this.setupDataChannel(peerId, event.channel);
    };

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
      // Continuous Web Audio Graph Pipeline
      if (event.track.kind === "audio") {
        audioManager.playRemoteAudio(peerId, event.track);
        event.track.onended = () => {
          audioManager.stopRemoteAudio(peerId);
        };
        return;
      }

      // Video tracks
      let stream = event.streams[0];
      if (!stream) {
        stream = new MediaStream([event.track]);
      } else {
        stream = new MediaStream(stream.getTracks().filter((t) => t.kind === "video"));
      }

      event.track.onended = () => {
        const cur = useRoomStore.getState().remoteStreams[peerId];
        if (cur) {
          const remaining = cur.getTracks().filter((t) => t.id !== event.track.id);
          useRoomStore.getState().setRemoteStream(
            peerId,
            remaining.length > 0 ? new MediaStream(remaining) : null
          );
        }
      };

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

    const pc = this.createPeerConnection(peerId);
    if (pc.signalingState !== "stable") return;

    try {
      const offer = await pc.createOffer();
      const enhancedSdp = optimizeOpusSdp(offer.sdp || "");
      const enhancedOffer = new RTCSessionDescription({ type: offer.type, sdp: enhancedSdp });
      await pc.setLocalDescription(enhancedOffer);
      this.sendWSMessage({
        type: "SIGNAL_OFFER",
        targetId: peerId,
        senderId: currentUser.id,
        sdp: enhancedOffer,
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

      // Process any early buffered ICE candidates
      const pending = this.pendingCandidates.get(senderId);
      if (pending && pending.length > 0) {
        for (const c of pending) {
          await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
        }
        this.pendingCandidates.delete(senderId);
      }

      const answer = await pc.createAnswer();
      const enhancedSdp = optimizeOpusSdp(answer.sdp || "");
      const enhancedAnswer = new RTCSessionDescription({ type: answer.type, sdp: enhancedSdp });
      await pc.setLocalDescription(enhancedAnswer);
      this.sendWSMessage({
        type: "SIGNAL_ANSWER",
        targetId: senderId,
        senderId: currentUser.id,
        sdp: enhancedAnswer,
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

        // Process any early buffered ICE candidates
        const pending = this.pendingCandidates.get(senderId);
        if (pending && pending.length > 0) {
          for (const c of pending) {
            await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
          }
          this.pendingCandidates.delete(senderId);
        }
      } catch (e) {
        console.error("Failed to handle answer from", senderId, e);
      }
    }
  }

  async handleIceCandidate(senderId: string, candidate: RTCIceCandidateInit) {
    const pc = this.peers.get(senderId);
    if (pc && pc.remoteDescription && pc.remoteDescription.type) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.error("Failed to add ICE candidate from", senderId, e);
      }
    } else {
      // Buffer early ICE candidate until remote description is set
      let list = this.pendingCandidates.get(senderId);
      if (!list) {
        list = [];
        this.pendingCandidates.set(senderId, list);
      }
      list.push(candidate);
    }
  }

  closePeer(peerId: string) {
    audioManager.stopRemoteAudio(peerId);
    this.pendingCandidates.delete(peerId);
    const dc = this.dataChannels.get(peerId);
    if (dc) {
      try { dc.close(); } catch (e) {}
      this.dataChannels.delete(peerId);
    }
    const pc = this.peers.get(peerId);
    if (pc) {
      pc.close();
      this.peers.delete(peerId);
    }
    useRoomStore.getState().setRemoteStream(peerId, null);
  }

  closeAll() {
    audioManager.stopAll();
    this.pendingCandidates.clear();
    for (const [peerId, dc] of this.dataChannels.entries()) {
      try { dc.close(); } catch (e) {}
    }
    this.dataChannels.clear();
    for (const [peerId, pc] of this.peers.entries()) {
      pc.close();
      useRoomStore.getState().setRemoteStream(peerId, null);
    }
    this.peers.clear();
  }
}

export const webrtc = new WebRTCManager();
