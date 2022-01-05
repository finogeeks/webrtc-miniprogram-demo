// index.js
// 获取应用实例
const app = getApp()
let sockTask
let pc1

Page({
  data: {
    id: null,
    localStreamId: null,
    localStream: null,
    remoteId: null,
    remoteStreamId: null
  },
  onLoad() {
    this.setData({
      id: Math.random().toString(36).slice(-4).toUpperCase()
    })
  },
  remoteIdChange(e) {
    this.setData({
      remoteId: e.detail.value
    })
  },
  async start() {
    await this.startSocket()
    await this.startWebrtc()
    await this.makeCall()
  },
  startSocket() {
    return new Promise((resolve) => {
      sockTask = wx.connectSocket({
        url: 'wss://finogeeks-tools.finogeeks.club/webrtc-server',
        complete: (res) => {
          console.log('connectSocket.complete: ', res)
        }
      });
      sockTask.onOpen(res => {
        console.log('sockTask.onOpen: ', res)
        sockTask.send({
          data: JSON.stringify({
            type: 'ready',
            id: this.data.id
          })
        })
        resolve()
      });
      sockTask.onMessage(async (res) => {
        let data
        try {
          data = JSON.parse(res.data)
        } catch (e) {
          data = {}
        }
        console.log('sockTask.onMessage: ', data)
        if (!this.data.remoteId) {
          this.setData({
            remoteId: data.from
          })
        }
        
        if (data.type === 'sendOffer') {
          // 收到 sendOffer 时，表示自己是 remote 端
          await pc1.setRemoteDescription(data.args)
          const answer = await pc1.createAnswer()
          sockTask.send({
            data: JSON.stringify({
              type: 'sendAnswer',
              args: answer,
              to: data.from,
              from: this.data.connectId
            })
          })
          await pc1.setLocalDescription(answer)
        }
        
        if (data.type === 'sendAnswer') {
          // 收到 answer 时，表示自己是 host 端
          await pc1.setRemoteDescription(data.args)
        }
  
        if (data.type === 'icecandidate') {
          await pc1.addIceCandidate(data.args)
        }
      })
    })
  },
  async startWebrtc() {
    let stream = await wx.webrtc.mediaDevices.getUserMedia({ video: true })
    const { streamId } = stream
    this.setData({
      localStreamId: streamId,
      localStream: stream
    })
    const servers = { iceServers: [{ urls: "stun:stun.stunprotocol.org" }] }

    pc1 = await wx.webrtc.createRTCPeerConnection(servers, {})

    pc1.addEventListener('icecandidate', e => {
      if (Object.keys(e.candidate).length === 0) return
      sockTask.send({
        data: JSON.stringify({
          args: e.candidate,
          type: 'icecandidate',
          to: this.data.remoteId,
          from: this.data.id
        }),
        complete(res) {
          console.log('sockTask.send complete: ', res)
        }
      })
    });

    pc1.addEventListener('track', e => {
      this.setData({
        remoteStreamId: e.streams[0].streamId
      })
    })

    const tracks = await stream.getTracks()
    tracks.forEach(t => {
      pc1.addTrack(t)
    })
  },
  async makeCall() {
    const offer = await pc1.createOffer({
      offerToReceiveAudio: 1,
      offerToReceiveVideo: 1
    })
    await pc1.setLocalDescription(offer)
    sockTask.send({
      data: JSON.stringify({
        type: 'sendOffer',
        args: offer,
        to: this.data.remoteId,
        from: this.data.id
      })
    })
  }
})
