// Zero external dependency WebRTC configuration (No Google, Cloudflare, or foreign STUN servers)
// Operates directly via LAN/WAN host candidates and local Chabokan network
export const RTC_CONFIG: RTCConfiguration = {
  iceServers: [],
  iceCandidatePoolSize: 0,
};
