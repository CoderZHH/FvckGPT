const channelName = 'nightshift-controls';
const connectTimeout = 18_000;

export function openPracticeLink({ token, onInvite, onChannel, onLost }) {
  const isHost = !token;
  const socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/practice-signal`);
  let session;
  let timer;
  let failed = false;

  function signal(message) {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  }

  function reset() {
    clearTimeout(timer);
    const previous = session;
    session = undefined;
    previous?.peer.close();
  }

  function fail(reason) {
    if (failed) return;
    failed = true;
    reset();
    if (!isHost) socket.close();
    onLost(reason);
  }

  function bindChannel(current, channel) {
    current.channel = channel;
    channel.addEventListener('open', () => {
      if (session !== current) return;
      clearTimeout(timer);
      onChannel(channel);
    });
    channel.addEventListener('close', () => {
      if (session === current) fail('disconnected');
    });
  }

  function begin(exchange) {
    if (session?.channel?.readyState === 'open') onLost('replacing');
    reset();
    failed = false;
    // Use only local ICE candidates. No STUN or TURN service is configured.
    const peer = new RTCPeerConnection({ iceServers: [] });
    const current = { peer, exchange };
    session = current;
    timer = setTimeout(() => fail('unreachable'), connectTimeout);
    peer.addEventListener('connectionstatechange', () => {
      if (session === current && peer.connectionState === 'failed') fail('unreachable');
    });
    return current;
  }

  async function sendDescription(current, description) {
    await current.peer.setLocalDescription(description);
    if (session !== current) return;
    // Send one SDP message with its local candidates instead of signaling each candidate.
    if (current.peer.iceGatheringState === 'complete') return publish();
    current.peer.addEventListener('icegatheringstatechange', function gathered() {
      if (current.peer.iceGatheringState !== 'complete') return;
      current.peer.removeEventListener('icegatheringstatechange', gathered);
      publish();
    });

    function publish() {
      if (session !== current) return;
      const { type, sdp } = current.peer.localDescription;
      signal({ type, sdp, exchange: current.exchange });
    }
  }

  socket.addEventListener('open', () => {
    signal(isHost ? { type: 'host' } : { type: 'phone', token });
    if (!isHost) timer = setTimeout(() => fail('unreachable'), connectTimeout);
  });
  socket.addEventListener('message', async event => {
    const data = JSON.parse(event.data);
    let current = session;
    try {
      if (isHost && data.type === 'invite') onInvite(data);
      if (isHost && data.type === 'peer') {
        current = begin(data.exchange);
        bindChannel(current, current.peer.createDataChannel(channelName));
        await sendDescription(current, await current.peer.createOffer());
      }
      if (!isHost && data.type === 'offer') {
        current = begin(data.exchange);
        current.peer.addEventListener('datachannel', ({ channel }) => {
          if (channel.label === channelName && session === current) bindChannel(current, channel);
          else channel.close();
        });
        await current.peer.setRemoteDescription({ type: 'offer', sdp: data.sdp });
        await sendDescription(current, await current.peer.createAnswer());
      }
      if (isHost && data.type === 'answer' && current?.exchange === data.exchange) {
        await current.peer.setRemoteDescription({ type: 'answer', sdp: data.sdp });
      }
    } catch {
      if (session === current) fail('unreachable');
    }
  });
  socket.addEventListener('close', event => {
    // An established data channel can keep playing through a signaling outage.
    if (session?.channel?.readyState === 'open' && event.code !== 4001) return;
    fail(event.code === 4001 ? 'replacing' : 'signaling');
  });

  return {
    requestInvite() { signal({ type: 'invite' }); },
  };
}
