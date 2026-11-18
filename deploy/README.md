# CRAZYSHOOT 部署说明

## 一次性 root 引导

把 `deploy/bootstrap-root.sh` 上传到服务器（或复制内容），然后：

```bash
sudo bash /tmp/bootstrap-root.sh
```

脚本只做：
1. 创建 `/var/www/crazyshoot/{releases,shared,current}`，属主 `haokee:www-data`；
2. 写入 `crazyshoot.haokee.org` 的 Nginx vhost；
3. 用 webroot 申请 Let's Encrypt 证书；
4. `nginx -t && systemctl reload nginx`。

不会修改其他站点，不写密码/密钥。可重复执行。

### 证书失败时
Cloudflare 代理 + “Always Use HTTPS” 可能拦截 HTTP-01。任选：
- Cloudflare SSL/TLS 模式临时设为 **Flexible**，或关闭 Always Use HTTPS，重跑脚本；
- 或用 DNS-01（Cloudflare API Token）签证书，再写 SSL vhost。

## 用户级部署（root 引导之后）

构建：

```bash
npm run build
```

上传 `dist/` 到：

```
/var/www/crazyshoot/releases/<version>/
```

切换：

```bash
ln -sfn /var/www/crazyshoot/releases/<version> /var/www/crazyshoot/current
```

保留最近 3 个版本，回滚就是切回上一个 `releases/<version>`。

## 信令服务

- 代码：`server/signal/`（待实现）
- 端口：`127.0.0.1:18789`
- systemd user：`crazyshoot-signal.service`
- Nginx：`/signal` → `127.0.0.1:18789`，WebSocket upgrade
- 游戏数据不经过信令：WebRTC 直连

## 验证

```bash
curl -I https://crazyshoot.haokee.org/
curl https://crazyshoot.haokee.org/healthz
```

WebSocket 101、LAN 双设备进房、ICE host candidate（无 relay）在游戏内网络诊断检查。
