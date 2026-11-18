import {afterEach,describe,expect,it,vi} from 'vitest';
import {NetworkSession} from '../src/network/session';

afterEach(()=>vi.unstubAllGlobals());
function session(hostname:string,bufferedAmount=0){
  vi.stubGlobal('location',{hostname});
  const net=new NetworkSession({role:'guest',name:'guest'},()=>{}) as any;
  net.hostId='host';
  const state={readyState:'open',bufferedAmount,send:vi.fn()};
  const reliable={readyState:'open',bufferedAmount:0,send:vi.fn()};
  net.links.set('host',{pc:{connectionState:'connected'},stateChannel:state,channel:reliable});
  net.signaling.relay=vi.fn();
  return {net,state,reliable,relay:net.signaling.relay};
}
describe('real-time transport',()=>{
  it('sends LAN movement over the unordered peer channel while keeping events reliable',()=>{
    const {net,state,reliable,relay}=session('192.168.1.5');
    const inputs={t:'inputs',commands:[]};net.send(inputs);
    expect(state.send).toHaveBeenCalledOnce();expect(relay).not.toHaveBeenCalled();
    net.send({t:'shoot'});expect(reliable.send).toHaveBeenCalledOnce();
  });
  it('falls back to relay as soon as an older state packet is still queued',()=>{
    const {net,state,relay}=session('game.example.com',512),inputs={t:'inputs',commands:[]};
    net.send(inputs);expect(state.send).not.toHaveBeenCalled();expect(relay).toHaveBeenCalledWith(inputs,'host');
  });
  it('uses an uncongested state channel directly',()=>{
    const {net,state,relay}=session('game.example.com');net.send({t:'inputs',commands:[]});
    expect(state.send).toHaveBeenCalledOnce();expect(relay).not.toHaveBeenCalled();
  });
  it('lets a stalled peer channel drain before using it again',()=>{
    const {net,state,relay}=session('192.168.1.5',1),inputs={t:'inputs',commands:[]};
    const now=vi.spyOn(performance,'now').mockReturnValue(100);net.send(inputs);state.bufferedAmount=0;
    now.mockReturnValue(200);net.send(inputs);expect(state.send).not.toHaveBeenCalled();expect(relay).toHaveBeenCalledTimes(2);
    now.mockReturnValue(1200);net.send(inputs);expect(state.send).toHaveBeenCalledOnce();now.mockRestore();
  });
  it('keeps movement out of the reliable event queue when the state channel is closed',()=>{
    const {net,state,reliable,relay}=session('192.168.1.5');state.readyState='connecting';
    const inputs={t:'inputs',commands:[]};net.send(inputs);
    expect(reliable.send).not.toHaveBeenCalled();expect(relay).toHaveBeenCalledWith(inputs,'host');
  });
});
