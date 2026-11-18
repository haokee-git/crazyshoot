import Turn from 'node-turn';
const server = new Turn({
  authMech: 'long-term',
  credentials: { crazyshoot: 'test' },
  listeningIps: ['127.0.0.1'],
  relayIps: ['127.0.0.1'],
  listeningPort: 3478,
  logLevel: 'OFF',
});
server.start();
console.log('local TURN on 127.0.0.1:3478');
process.on('SIGTERM', () => { server.stop(); process.exit(0); });
