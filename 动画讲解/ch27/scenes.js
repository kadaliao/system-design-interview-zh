// 第 27 章 数字钱包：场景定义（外壳与工具来自 ../lib/core.js）
import { ctx, W, H, clamp, lerp, P, eOut, eIO, eBack, MONO, SANS, INK, MUTE, DIM, RED, SC,
  rr, glass, text, glow, dot, badge, header, arrow, box, dbIcon, packet, statCard, bullet, hbar } from '../lib/core.js';

export const meta = { no: 27, title: '数字钱包', en: 'Digital Wallet' };

// 角色配色：协调者=靛，分片1(A)=青，分片2(C)=粉，事件=琥珀，成功=青柠，失败=RED
const COL_COORD = SC[1], COL_A = SC[0], COL_C = SC[2], COL_EV = SC[3], OK = SC[4];
const F = (lt, a, b) => eOut(P(lt, a, b));
const tween = (v0, v1, lt, t0, t1) => Math.round(lerp(v0, v1, eIO(P(lt, t0, t1))));
const fmt = (n) => n.toLocaleString('en-US');

// ───────── 通用：分片卡 / 带标签数据包 ─────────
function shardCard(x, y, w, h, title, sub, color, { a = 1, bal = null, balColor = INK, op = null, opColor = INK, status = null, statusColor = MUTE, hot = false } = {}) {
  if (a <= 0) return;
  ctx.save(); ctx.globalAlpha *= a;
  glass(x, y, w, h, { accent: hot ? RED : color });
  ctx.fillStyle = hot ? RED : color; glow(hot ? RED : color, 16); rr(x + 28, y, w - 56, 5, 3); ctx.fill(); ctx.shadowBlur = 0;
  text(title, x + 30, y + 52, { size: 30, weight: 800, color: hot ? RED : color });
  text(sub, x + w - 28, y + 52, { size: 22, color: MUTE, align: 'right', font: MONO });
  if (bal != null) text(`$${bal}`, x + w / 2, y + 140, { size: 72, weight: 800, font: MONO, color: balColor, align: 'center' });
  if (op) text(op, x + w / 2, y + h - 66, { size: 26, weight: 700, font: MONO, color: opColor, align: 'center' });
  if (status) text(status, x + w / 2, y + h - 24, { size: 24, weight: 600, color: statusColor, align: 'center' });
  ctx.restore();
}
function lpacket(x1, y1, x2, y2, p, label, color, { dy = -26 } = {}) {
  if (p <= 0 || p >= 1) return;
  packet(x1, y1, x2, y2, p, color, { r: 10, trail: 0.2 });
  text(label, lerp(x1, x2, p), lerp(y1, y2, p) + dy, { size: 24, weight: 700, color, font: MONO, align: 'center' });
}
const CO = { x: 1000, y: 170, w: 460, h: 100 };
const SA = { x: 850, y: 400, w: 380, h: 260 };
const SCc = { x: 1420, y: 400, w: 380, h: 260 };
const aTop = [1040, 400], cTop = [1610, 400], coL = [1100, 270], coR = [1360, 270];
// 两侧各一条下行/上行通道：A 侧 (coL -> aTop)，C 侧 (coR -> cTop)；回程横向偏移 56
const down = (side) => (side === 'A' ? [coL[0], coL[1], aTop[0], aTop[1]] : [coR[0], coR[1], cTop[0], cTop[1]]);
const up = (side) => { const d = down(side); return [d[2] + 56, d[3], d[0] + 56, d[1]]; };
function link(side, a = 1) {
  const d = down(side), u = up(side);
  arrow(d[0], d[1], d[2], d[3], { color: 'rgba(255,255,255,0.18)', w: 2.5, head: 10, a });
  arrow(u[0], u[1], u[2], u[3], { color: 'rgba(255,255,255,0.12)', w: 2.5, head: 10, a });
}
function coordinator(a = 1, label = '钱包服务（协调者）', hot = false) {
  box(CO.x, CO.y, CO.w, CO.h, label, { color: COL_COORD, a, hot, size: 30 });
}
function cross(x, y, color = RED, s = 22, a = 1) {
  ctx.save(); ctx.globalAlpha *= a; ctx.strokeStyle = color; ctx.lineWidth = 7; ctx.lineCap = 'round'; glow(color, 14);
  ctx.beginPath(); ctx.moveTo(x - s, y - s); ctx.lineTo(x + s, y + s); ctx.moveTo(x + s, y - s); ctx.lineTo(x - s, y + s); ctx.stroke(); ctx.restore();
}
function tick(x, y, color = OK, s = 18, a = 1) {
  ctx.save(); ctx.globalAlpha *= a; ctx.strokeStyle = color; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; glow(color, 14);
  ctx.beginPath(); ctx.moveTo(x - s, y); ctx.lineTo(x - s * 0.3, y + s * 0.8); ctx.lineTo(x + s, y - s * 0.8); ctx.stroke(); ctx.restore();
}
function ring(x, y, p, color, r0 = 30, r1 = 100) {
  if (p <= 0 || p >= 1) return;
  ctx.save(); ctx.strokeStyle = color; ctx.globalAlpha = 1 - p; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(x, y, lerp(r0, r1, p), 0, 7); ctx.stroke(); ctx.restore();
}

// ───────── 片头 ─────────
function sceneTitle(lt) {
  const a = eOut(P(lt, 0.2, 1.2));
  text('系统设计面试 · 动画讲解', 110, 360, { size: 30, weight: 600, color: SC[0], ls: 6, a });
  const g = ctx.createLinearGradient(110, 0, 800, 0); g.addColorStop(0, '#fff'); g.addColorStop(1, '#b4b7ff');
  const k = eOut(P(lt, 0.4, 1.4));
  ctx.save(); ctx.globalAlpha *= k; ctx.translate(0, (1 - k) * 30);
  ctx.font = `900 150px ${SANS}`; ctx.fillStyle = g; ctx.letterSpacing = '4px'; ctx.fillText('数字钱包', 104, 520); ctx.restore();
  text('Digital Wallet', 112, 590, { size: 40, color: MUTE, font: MONO, a: F(lt, 0.8, 1.6) });
  text('第 27 章', 112, 680, { size: 34, weight: 700, a: F(lt, 1.2, 2) });
  // 右侧：两个分片之间转账 + 事件流
  dbIcon(1000, 330, 190, 220, '分片 1', { color: COL_A, a: F(lt, 0.6, 1.4), fill: 0.7 });
  dbIcon(1560, 330, 190, 220, '分片 2', { color: COL_C, a: F(lt, 0.8, 1.6), fill: 0.4 });
  for (let i = 0; i < 4; i++) {
    const p = ((lt * 0.35 + i / 4) % 1);
    const x = lerp(1210, 1540, p), y = 440 - Math.sin(p * Math.PI) * 70;
    dot(x, y, 14, COL_EV, { g: 22, a: F(lt, 1.8, 2.6) * Math.sin(p * Math.PI) });
  }
  for (let i = 0; i < 6; i++) {
    const x = 1000 + i * 125, ea = F(lt, 2.4 + i * 0.25, 3 + i * 0.25);
    glass(x, 690, 105, 60, { r: 14, a: ea, accent: COL_EV });
    text(`E${i + 1}`, x + 52, 729, { size: 26, weight: 800, font: MONO, color: COL_EV, align: 'center', a: ea });
  }
}

// ───────── 1 规模：100 万 TPS → 节点数 ─────────
function sceneScale(lt) {
  header(lt, '01', '为什么要分片', SC[1], '每秒一百万笔转账');
  statCard(110, 390, 640, '目标吞吐', '1,000,000 TPS', { color: SC[1], a: F(lt, 1.2, 1.9), h: 104 });
  statCard(110, 508, 640, '单节点（书中假设）', '≈ 1,000 TPS', { color: SC[0], a: F(lt, 4.0, 4.7), h: 104 });
  const nodes = tween(0, 1000, lt, 6.0, 8.0);
  statCard(110, 626, 640, '需要节点', `${fmt(nodes)} 个`, { color: SC[3], a: F(lt, 5.8, 6.5), h: 104 });
  statCard(110, 744, 640, '账户操作（两条腿）', `${fmt(tween(0, 2000000, lt, 12.0, 14.5))} 次/秒`, { color: SC[2], a: F(lt, 11.0, 11.7), h: 104 });
  // 节点网格（示意：只画 40 个）
  const ga = 1 - F(lt, 16.0, 16.8);
  if (ga > 0) {
    for (let i = 0; i < 40; i++) {
      const c = i % 10, r = Math.floor(i / 10), t0 = 4.2 + i * 0.09;
      const p = eBack(P(lt, t0, t0 + 0.5));
      if (p > 0.02) dbIcon(830 + c * 100, 190 + r * 105, 56, 66, '', { color: SC[0], a: clamp(p * 2) * ga });
    }
    text('每个圆柱 = 一个数据库节点（示意只画 40 个，实际 1,000 个）', 830, 628, { size: 24, color: MUTE, a: F(lt, 8.0, 8.8) * ga });
  }
  // 一笔转账的两条腿
  const la = F(lt, 9.8, 10.6);
  text('1 笔转账', 830, 690, { size: 28, weight: 700, a: la });
  const w1 = badge(980, 654, '扣款  A −$1', COL_A, F(lt, 10.4, 11.2));
  badge(980 + w1 + 24, 654, '入账  C +$1', COL_C, F(lt, 11.4, 12.2));
  text('= 2 次账户操作 ⇒ 每秒约 200 万次', 830, 770, { size: 30, weight: 700, color: SC[2], a: F(lt, 14.5, 15.3) });
  // 表：单节点 TPS → 节点数量
  const ta = F(lt, 16.6, 17.4);
  if (ta > 0) {
    text('单节点 TPS 越高，节点越少', 830, 210, { size: 26, color: MUTE, a: ta });
    [['100', '20,000'], ['1,000', '2,000'], ['10,000', '200']].forEach(([t, n], k) => {
      const y = 240 + k * 100, ra = F(lt, 16.8 + k * 0.5, 17.6 + k * 0.5), hl = k === 1;
      glass(830, y, 760, 80, { a: ra, accent: hl ? SC[3] : null, r: 18 });
      text(`${t} TPS`, 870, y + 52, { size: 32, weight: 700, font: MONO, a: ra });
      text('→', 1130, y + 52, { size: 30, color: MUTE, a: ra });
      text(`${n} 个节点`, 1190, y + 52, { size: 34, weight: 800, font: MONO, color: hl ? SC[3] : INK, a: ra });
    });
    text('结论：账户必须分散到许多分片', 830, 590, { size: 30, weight: 700, color: COL_C, a: F(lt, 18.6, 19.4) });
  }
}

// ───────── 2 原子性：跨分片的两条腿 ─────────
function sceneAtomic(lt) {
  header(lt, '02', '跨分片的原子性', RED, '先扣再加 = 两次写入');
  coordinator(F(lt, 0.6, 1.2));
  const sa = F(lt, 2.2, 3.0);
  link('A', sa); link('C', sa);
  // 余额
  const aBal = tween(10, 9, lt, 5.2, 5.8);
  shardCard(SA.x, SA.y, SA.w, SA.h, 'A', '分片 1', COL_A, { a: sa, bal: aBal, balColor: lt > 5.2 ? SC[3] : INK, op: lt > 5.2 ? '−$1  已扣' : null, opColor: SC[3], status: lt > 5.4 ? '本地事务已提交' : '账户 A', statusColor: MUTE });
  const crashed = lt > 11.0;
  shardCard(SCc.x, SCc.y, SCc.w, SCc.h, 'C', '分片 2', COL_C, { a: sa, bal: 5, op: crashed ? '+$1  从未到达' : null, opColor: RED, status: crashed ? '余额没变' : '账户 C', statusColor: crashed ? RED : MUTE, hot: crashed && lt > 11.6 });
  text('余额为示意', 1000, 700, { size: 20, color: DIM, a: sa });
  // 数据包
  const d = down('A'), d2 = down('C');
  lpacket(d[0], d[1], d[2], d[3], P(lt, 4.2, 5.2), '−1', SC[3]);
  lpacket(d2[0], d2[1], d2[2], d2[3], P(lt, 8.0, 9.4), '+1', SC[3]);
  // 故障：协调者崩溃 -> 包消失
  const cr = P(lt, 9.4, 10.4);
  if (lt > 9.0) {
    const x = lerp(d2[0], d2[2], 0.55), y = lerp(d2[1], d2[3], 0.55);
    if (lt < 9.4) { /* 包在途 */ }
    cross(x, y, RED, 24, F(lt, 9.4, 9.9));
    ring(x, y, P(lt, 9.4, 10.4), RED, 20, 90);
    text('故障 / 超时', x + 40, y + 10, { size: 26, weight: 700, color: RED, a: F(lt, 9.8, 10.4) });
  }
  // 左栏
  bullet(0, 'A 在分片 1，C 在分片 2', F(lt, 2.4, 3.0));
  bullet(1, '先扣 A，再加 C：两次写入', F(lt, 5.8, 6.4));
  bullet(2, '中途故障：钱凭空消失', F(lt, 11.0, 11.6), { color: RED });
  const tot = lt < 5.4 ? 15 : crashed ? 14 : 15 - Math.round(P(lt, 5.2, 5.8));
  statCard(110, 640, 640, '两个账户总额（示意）', `$${lt > 5.2 ? Math.round(lerp(15, 14, P(lt, 5.2, 5.8))) : 15}`, { color: tot < 15 && lt > 11 ? RED : SC[1], a: F(lt, 3.6, 4.3), note: lt > 11.2 ? '少了 $1' : '' });
  const ba = F(lt, 16.2, 17.0);
  if (ba > 0) {
    glass(840, 760, 960, 100, { a: ba, accent: OK });
    text('要么两条腿都成功，要么都没发生', 1320, 825, { size: 40, weight: 800, color: OK, align: 'center', a: ba });
  }
}

// ───────── 3 两阶段提交 ─────────
function sceneTwoPC(lt) {
  header(lt, '03', '两阶段提交 2PC', SC[1], '先问准备好没，再一起提交');
  coordinator(F(lt, 0.6, 1.2), lt > 17.0 ? '协调者崩溃' : '钱包服务（协调者）', lt > 17.0);
  const sa = F(lt, 1.0, 1.8);
  link('A', sa); link('C', sa);
  const prep = lt > 6.3, commit = lt > 10.2;
  const stA = commit ? '已提交' : prep ? '已准备 · 持锁中' : '等待';
  const stC = stA;
  const crash = lt > 17.0;
  const col = commit ? OK : prep ? SC[3] : MUTE;
  shardCard(SA.x, SA.y, SA.w, SA.h, 'A', '分片 1', COL_A, { a: sa, bal: commit ? 9 : 10, op: prep ? (commit ? 'COMMIT' : 'PREPARE') : null, opColor: col, status: crash && !commit ? '' : stA, statusColor: col });
  shardCard(SCc.x, SCc.y, SCc.w, SCc.h, 'C', '分片 2', COL_C, { a: sa, bal: commit ? 6 : 5, op: prep ? (commit ? 'COMMIT' : 'PREPARE') : null, opColor: col, status: stC, statusColor: col });
  // 阶段徽标
  const p1 = F(lt, 3.6, 4.2), p2 = F(lt, 9.0, 9.6);
  text('阶段 1', 850, 720, { size: 24, color: lt < 9.4 ? SC[3] : DIM, weight: 700, font: MONO, a: p1 });
  text('准备', 940, 720, { size: 26, weight: 700, color: lt < 9.4 ? INK : DIM, a: p1 });
  text('阶段 2', 1100, 720, { size: 24, color: commit || lt > 9.4 ? OK : DIM, weight: 700, font: MONO, a: p2 });
  text('提交', 1190, 720, { size: 26, weight: 700, color: INK, a: p2 });
  // 准备：下行 prepare，上行 yes
  ['A', 'C'].forEach((s) => {
    const d = down(s), u = up(s);
    lpacket(d[0], d[1], d[2], d[3], P(lt, 4.4, 5.6), 'prepare', SC[3]);
    lpacket(u[0], u[1], u[2], u[3], P(lt, 6.6, 7.8), '可以', OK);
    lpacket(d[0], d[1], d[2], d[3], P(lt, 10.2, 11.4), 'commit', OK);
  });
  // 锁时间条
  const ta = F(lt, 12.0, 12.8);
  if (ta > 0) {
    text('持锁时间线', 850, 800, { size: 22, color: MUTE, a: ta });
    ctx.save(); ctx.globalAlpha *= ta; rr(850, 816, 950, 28, 14); ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fill();
    const w = 950 * P(lt, 12.2, 15.4) * 0.62;
    ctx.fillStyle = SC[3]; glow(SC[3], 12); rr(850, 816, Math.max(w, 28), 28, 14); ctx.fill(); ctx.restore();
    text('prepare → commit 之间一直占着锁', 850, 884, { size: 24, weight: 600, color: SC[3], a: F(lt, 14.0, 14.8) });
  }
  if (crash) {
    cross(CO.x + CO.w + 40, CO.y + 50, RED, 20, F(lt, 17.0, 17.5));
    ring(CO.x + CO.w + 40, CO.y + 50, P(lt, 17.0, 18.0), RED);
    text('参与者不知该提交还是中止，只能继续持锁等待', 850, 762, { size: 24, color: RED, weight: 700, a: F(lt, 18.0, 18.8) });
  }
  bullet(0, 'prepare：全部先答应', F(lt, 4.6, 5.2));
  bullet(1, 'commit：全部一起提交', F(lt, 10.2, 10.8));
  statCard(110, 640, 640, '缺点 ①', '持锁等待，锁竞争', { color: SC[3], a: F(lt, 14.4, 15.1), h: 100 });
  statCard(110, 760, 640, '缺点 ②', '协调者单点故障', { color: RED, a: F(lt, 17.0, 17.7), h: 100 });
}

// ───────── 4 TC/C：尝试-确认-取消 ─────────
function sceneTCC(lt) {
  header(lt, '04', 'TC/C 补偿', SC[2], 'Try · Confirm · Cancel');
  coordinator(F(lt, 0.6, 1.2));
  const sa = F(lt, 1.0, 1.8);
  link('A', sa); link('C', sa);
  // 两轮：失败路径 (lt<18.6) / 成功路径 (lt>=18.6)
  const r2 = lt >= 18.6;
  const t = r2 ? lt - 18.6 + 3.2 : lt;
  // 第一轮时间点（t）：Try 包 5.6–6.8；A 扣款 7.0–7.6；C 无响应 12.8；Cancel 包 14.6–15.8；A 加回 16.0–16.8
  // 第二轮复用 Try（3.2–4.4 对应），Confirm 在 t = 8.0（lt 23.4）
  let aBal = 10, cBal = 5, opA = null, opC = null, opColA = INK, opColC = INK, stA = '', stC = '', phase = 0, hotC = false, hotA = false;
  if (!r2) {
    if (lt > 7.0) aBal = tween(10, 9, lt, 7.0, 7.6);
    if (lt > 5.6) { opA = 'Try: −$1'; opC = 'Try: NOP'; opColA = SC[3]; opColC = MUTE; phase = 1; }
    if (lt > 7.8) stA = '本地事务已提交 ✓';
    if (lt > 12.8) { stC = '响应失败 ✗'; hotC = true; opColC = RED; }
    if (lt > 14.6) { phase = 3; opA = 'Cancel: +$1'; opC = 'Cancel: NOP'; opColA = SC[2]; opColC = MUTE; stA = ''; }
    if (lt > 16.0) aBal = tween(9, 10, lt, 16.0, 16.8);
    if (lt > 16.9) { stA = '已回滚 ✓'; }
  } else {
    const u = lt - 18.6; // 第二轮局部
    phase = 1;
    opA = 'Try: −$1'; opC = 'Try: NOP'; opColA = SC[3]; opColC = MUTE;
    aBal = tween(10, 9, lt, 19.2, 19.8);
    if (u > 1.4) { stA = '本地事务已提交 ✓'; stC = '响应成功 ✓'; }
    if (u > 2.6) { phase = 2; opA = 'Confirm: NOP'; opC = 'Confirm: +$1'; opColA = MUTE; opColC = OK; stA = ''; stC = ''; }
    if (u > 3.6) cBal = tween(5, 6, lt, 22.2, 22.9);
    if (u > 4.4) { stC = '已入账 ✓'; stA = '已扣款 ✓'; }
  }
  shardCard(SA.x, SA.y, SA.w, SA.h, 'A', '分片 1', COL_A, { a: sa, bal: aBal, balColor: aBal === 9 ? SC[3] : INK, op: opA, opColor: opColA, status: stA, statusColor: stA.includes('回滚') || stA.includes('已扣') || stA.includes('✓') ? OK : MUTE, hot: hotA });
  shardCard(SCc.x, SCc.y, SCc.w, SCc.h, 'C', '分片 2', COL_C, { a: sa, bal: cBal, balColor: cBal === 6 ? OK : INK, op: opC, opColor: opColC, status: stC, statusColor: stC.includes('失败') ? RED : OK, hot: hotC });
  // 数据包
  const dA = down('A'), dC = down('C'), uA = up('A'), uC = up('C');
  if (!r2) {
    lpacket(dA[0], dA[1], dA[2], dA[3], P(lt, 5.6, 6.8), 'Try −1', SC[3]);
    lpacket(dC[0], dC[1], dC[2], dC[3], P(lt, 5.6, 6.8), 'Try NOP', MUTE);
    lpacket(uA[0], uA[1], uA[2], uA[3], P(lt, 8.0, 9.2), '成功', OK);
    // C 的响应失败：红叉
    const x = lerp(uC[0], uC[2], 0.5), y = lerp(uC[1], uC[3], 0.5);
    cross(x, y, RED, 22, F(lt, 12.8, 13.3)); ring(x, y, P(lt, 12.8, 13.8), RED, 18, 80);
    lpacket(dA[0], dA[1], dA[2], dA[3], P(lt, 14.6, 15.8), 'Cancel', SC[2]);
    lpacket(dC[0], dC[1], dC[2], dC[3], P(lt, 14.6, 15.8), 'Cancel', SC[2]);
  } else {
    const u = lt - 18.6;
    lpacket(dA[0], dA[1], dA[2], dA[3], P(u, 0.2, 1.2), 'Try −1', SC[3]);
    lpacket(dC[0], dC[1], dC[2], dC[3], P(u, 0.2, 1.2), 'Try NOP', MUTE);
    lpacket(uA[0], uA[1], uA[2], uA[3], P(u, 1.4, 2.4), '成功', OK);
    lpacket(uC[0], uC[1], uC[2], uC[3], P(u, 1.4, 2.4), '成功', OK);
    lpacket(dA[0], dA[1], dA[2], dA[3], P(u, 2.8, 3.8), 'Confirm', OK);
    lpacket(dC[0], dC[1], dC[2], dC[3], P(u, 2.8, 3.8), 'Confirm', OK);
  }
  // 场景标注
  const lab = !r2 ? '情形一：C 响应失败 → 取消' : '情形二：全部成功 → 确认';
  text(lab, 850, 722, { size: 28, weight: 700, color: !r2 ? RED : OK, a: lt > 5.0 ? 1 : 0 });
  text('余额为示意', 850, 770, { size: 20, color: DIM, a: sa });
  // 左栏：阶段标签
  [['Try', '预留：A 本地扣款', SC[3], 1], ['Confirm', '确认：C 本地入账', OK, 2], ['Cancel', '取消：A 加回', SC[2], 3]].forEach(([n, s, c, k], i) => {
    const y = 400 + i * 100, on = phase === k, a = F(lt, 3.0 + i * 0.5, 3.8 + i * 0.5);
    glass(110, y, 640, 82, { a, accent: on ? c : null, fill: on ? 0.14 : 0.04, r: 20 });
    text(n, 140, y + 54, { size: 32, weight: 800, color: on ? c : MUTE, font: MONO, a });
    text(s, 330, y + 53, { size: 26, weight: 600, color: on ? INK : DIM, a });
  });
  const oa = F(lt, 23.6, 24.4);
  glass(110, 720, 640, 100, { a: oa, accent: SC[3] });
  text('先扣款，后入账', 140, 782, { size: 40, weight: 800, color: SC[3], a: oa });
}

// ───────── 5 Saga：线性执行 + 反向补偿 ─────────
function sceneSaga(lt) {
  header(lt, '05', 'Saga', SC[3], '一步一步做，失败就倒着补');
  box(1040, 170, 420, 96, '编排者', { color: COL_COORD, a: F(lt, 16.8, 17.6), size: 30, sub: 'orchestrator' });
  const S1 = { x: 850, y: 340 }, S2 = { x: 1370, y: 340 }, W_ = 430, H_ = 170;
  const ba = F(lt, 3.0, 3.8);
  // 步骤 1
  const s1run = lt > 4.4, s1ok = lt > 6.4;
  const bal = lt > 13.6 ? tween(9, 10, lt, 13.6, 14.4) : tween(10, 9, lt, 5.0, 5.8);
  glass(S1.x, S1.y, W_, H_, { a: ba, accent: s1ok ? COL_A : null });
  text('① 扣款 A −$1', S1.x + 28, S1.y + 52, { size: 32, weight: 800, color: COL_A, a: ba });
  text('分片 1 · 本地事务', S1.x + 28, S1.y + 92, { size: 22, color: MUTE, font: MONO, a: ba });
  text(`A = $${bal}`, S1.x + 28, S1.y + 144, { size: 44, weight: 800, font: MONO, a: ba, color: bal === 9 ? SC[3] : INK });
  if (s1ok) tick(S1.x + W_ - 50, S1.y + 120, OK, 20, F(lt, 6.4, 6.9));
  // 步骤 2
  const fail = lt > 10.6;
  glass(S2.x, S2.y, W_, H_, { a: ba, accent: fail ? RED : null });
  text('② 入账 C +$1', S2.x + 28, S2.y + 52, { size: 32, weight: 800, color: COL_C, a: ba });
  text('分片 2 · 本地事务', S2.x + 28, S2.y + 92, { size: 22, color: MUTE, font: MONO, a: ba });
  text(fail ? '失败 ✗' : lt > 7.4 ? '执行中…' : '待执行', S2.x + 28, S2.y + 144, { size: 40, weight: 800, color: fail ? RED : lt > 7.4 ? SC[3] : DIM, a: ba });
  if (fail) { cross(S2.x + W_ - 50, S2.y + 120, RED, 20, F(lt, 10.6, 11.1)); ring(S2.x + W_ - 50, S2.y + 120, P(lt, 10.6, 11.6), RED); }
  // 前进箭头
  arrow(S1.x + W_ + 8, S1.y + 85, S2.x - 8, S2.y + 85, { color: OK, p: eOut(P(lt, 6.8, 7.6)), a: ba, g: 8 });
  if (lt > 7.0 && lt < 10.6) lpacket(S1.x + W_ + 8, S1.y + 85, S2.x - 8, S2.y + 85, P(lt, 7.4, 8.8), '', SC[3]);
  // 补偿行
  const ca = F(lt, 11.6, 12.4);
  if (ca > 0) {
    ctx.save(); ctx.globalAlpha *= ca; ctx.setLineDash([10, 8]); ctx.lineWidth = 2.5; ctx.strokeStyle = SC[2]; glow(SC[2], 10);
    rr(S1.x, 600, W_, 150, 22); ctx.stroke(); ctx.restore();
    text('补偿 ①′  A +$1', S1.x + 28, 660, { size: 32, weight: 800, color: SC[2], a: ca });
    text('把第 1 步反向抵消', S1.x + 28, 704, { size: 24, color: MUTE, a: ca });
    arrow(S2.x + 80, S2.y + H_ + 6, S1.x + W_ - 40, 596, { color: SC[2], p: eOut(P(lt, 12.2, 13.6)), a: ca, g: 8, dash: [10, 8] });
    if (lt > 14.4) tick(S1.x + W_ - 50, 672, OK, 20, F(lt, 14.4, 14.9));
  }
  text('补偿也是新的业务动作，可能失败，需重试与告警', 850, 800, { size: 24, color: MUTE, a: F(lt, 15.0, 15.8) });
  bullet(0, '操作排成线性顺序', F(lt, 3.2, 3.8));
  bullet(1, '每步一个独立本地事务', F(lt, 5.4, 6.0));
  bullet(2, '失败：从已完成步反向补偿', F(lt, 11.4, 12.0), { color: SC[2] });
  badge(110, 640, '编排式：协调者统一指挥', COL_COORD, F(lt, 17.8, 18.6));
  text('协同式：各服务订阅事件，逻辑分散', 110, 740, { size: 24, color: DIM, a: F(lt, 19.0, 19.8) });
}

// ───────── 6 方案对比 ─────────
function sceneCompare(lt) {
  header(lt, '06', '三种方案对比', COL_COORD, '取舍在哪里');
  const X0 = 810, LW = 160, CW = 290, Y0 = 190, RH = 118;
  const cols = [['两阶段提交', '2PC', COL_COORD], ['TC/C', 'Try·Confirm·Cancel', SC[2]], ['Saga', '编排式', SC[3]]];
  cols.forEach(([n, s, c], k) => {
    const a = F(lt, 0.9 + k * 0.3, 1.6 + k * 0.3), x = X0 + LW + k * CW;
    glass(x + 6, Y0, CW - 12, 100, { a, accent: c, r: 20 });
    text(n, x + CW / 2, Y0 + 46, { size: 32, weight: 800, align: 'center', color: c, a });
    text(s, x + CW / 2, Y0 + 82, { size: 20, align: 'center', color: MUTE, font: MONO, a });
  });
  const rows = [
    ['事务形态', ['一次逻辑事务', '两阶段各自本地事务', '线性的本地事务链'], 3.4],
    ['失败处理', ['取消全部事务', 'Cancel 补偿', '回滚阶段反向补偿'], 9.0],
    ['执行顺序', ['协调者统一推进', '可任意安排，可并行', '线性，不并行'], 15.2],
    ['中间状态', ['prepare 后持锁等待', '可见部分不一致', '可见部分不一致'], 21.0],
  ];
  rows.forEach(([lab, cells, t0], r) => {
    const y = Y0 + 124 + r * RH, ra = F(lt, t0, t0 + 0.8);
    text(lab, X0 + 6, y + 62, { size: 26, weight: 700, color: MUTE, a: ra });
    cells.forEach((c, k) => {
      const x = X0 + LW + k * CW, hl = r === 2 && k === 1 && lt > 16.4;
      glass(x + 6, y, CW - 12, RH - 14, { a: ra * (r === 2 && lt > 16.4 && k === 2 ? 0.8 : 1), accent: hl ? OK : null, r: 18, fill: hl ? 0.14 : 0.055 });
      text(c, x + CW / 2, y + 60, { size: 25, weight: hl ? 800 : 600, align: 'center', color: hl ? OK : INK, a: ra });
    });
  });
  bullet(0, '2PC：持锁换来逻辑原子', F(lt, 3.6, 4.2));
  bullet(1, 'TC/C、Saga：靠补偿', F(lt, 9.4, 10.0));
  bullet(2, 'TC/C 可并行 → 延迟更低', F(lt, 16.0, 16.6), { color: OK });
  statCard(110, 660, 640, '无论哪种', '仍需历史重放兜底', { color: COL_EV, a: F(lt, 22.4, 23.2), h: 104 });
}

// ───────── 7 事件溯源：命令 → 状态机 → 事件 ─────────
const START = { A: 10, B: 8, C: 2 };
const CMDS = [
  { id: 'C1', t: 'A→C $1', from: 'A', to: 'C', amt: 1 },
  { id: 'C2', t: 'B→A $2', from: 'B', to: 'A', amt: 2 },
  { id: 'C3', t: 'C→B $9', from: 'C', to: 'B', amt: 9, bad: true },
  { id: 'C4', t: 'A→B $4', from: 'A', to: 'B', amt: 4 },
];
const EVS = [
  { from: 'A', to: 'C', amt: 1 }, { from: 'B', to: 'A', amt: 2 }, { from: 'A', to: 'B', amt: 4 }, { from: 'C', to: 'B', amt: 1 },
  { from: 'B', to: 'C', amt: 3 }, { from: 'A', to: 'C', amt: 2 }, { from: 'C', to: 'A', amt: 1 }, { from: 'B', to: 'A', amt: 1 },
];
function replay(n, start = START) {
  const s = { ...start };
  for (let i = 0; i < n; i++) { s[EVS[i].from] -= EVS[i].amt; s[EVS[i].to] += EVS[i].amt; }
  return s;
}
const ACC = [['A', COL_A], ['B', COL_COORD], ['C', COL_C]];
function balanceBars(x, y, s, a, { w = 360 } = {}) {
  ACC.forEach(([n, c], i) => hbar(x, y + i * 62, w, n, clamp(s[n] / 14), c, { a, valueText: `$${s[n]}`, labelW: 44 }));
}
function sceneES(lt) {
  header(lt, '07', '事件溯源', COL_EV, '事件是唯一事实');
  const T = [9.2, 11.6, 13.8, 16.0]; // 每条命令处理时刻（略晚于旁白的「状态机验证」）
  // 命令队列
  const qa = F(lt, 4.6, 5.4);
  text('命令队列 · 先进先出', 830, 190, { size: 22, color: MUTE, a: qa });
  CMDS.forEach((c, i) => {
    const x = 830 + i * 150, done = lt > T[i] + 0.6, a = F(lt, 5.0 + i * 0.35, 5.8 + i * 0.35) * (done ? 0.28 : 1);
    glass(x, 208, 136, 76, { r: 16, a, accent: c.bad && lt > T[i] ? RED : COL_C });
    text(c.id, x + 68, 238, { size: 20, color: MUTE, font: MONO, align: 'center', a });
    text(c.t, x + 68, 270, { size: 22, weight: 700, font: MONO, align: 'center', a });
  });
  // 状态机
  const ma = F(lt, 8.4, 9.2);
  box(1500, 170, 300, 130, '状态机', { color: COL_COORD, a: ma, sub: '验证 · 确定性', size: 30 });
  arrow(1450, 245, 1494, 245, { color: MUTE, a: ma, head: 10, w: 3 });
  // 命令处理动画：一个包由队列 -> 状态机 -> 事件
  let evCount = 0;
  CMDS.forEach((c, i) => {
    const t0 = T[i];
    const p = P(lt, t0, t0 + 0.9);
    if (p > 0 && p < 1) packet(1200, 246, 1500, 246, p, c.bad ? RED : COL_C, { r: 10, trail: 0.2 });
    if (lt > t0 + 0.9 && lt < t0 + 1.6 && c.bad) { text('余额不足，拒绝', 1566, 338, { size: 24, weight: 700, color: RED, align: 'center', a: F(lt, t0 + 0.9, t0 + 1.2) }); cross(1456, 330, RED, 12, 1); }
    if (!c.bad && lt > t0 + 0.9) evCount++;
  });
  // 事件日志（只追加）
  const ea = F(lt, 8.4, 9.2);
  text('事件日志 · 只追加，不修改', 830, 392, { size: 22, color: MUTE, a: ea });
  ctx.save(); ctx.globalAlpha *= ea; ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.setLineDash([6, 8]); ctx.lineWidth = 2; rr(826, 408, 970, 128, 22); ctx.stroke(); ctx.restore();
  let k = 0;
  CMDS.forEach((c, i) => {
    if (c.bad) return;
    const t0 = T[i] + 0.9, p = eBack(P(lt, t0, t0 + 0.6)), x = 850 + k * 220;
    if (p > 0.02) {
      ctx.save(); ctx.globalAlpha *= clamp(p * 2); ctx.translate(x + 100, 472); ctx.scale(lerp(0.7, 1, clamp(p)), lerp(0.7, 1, clamp(p))); ctx.translate(-x - 100, -472);
      glass(x, 428, 200, 88, { r: 16, accent: COL_EV });
      text(`E${k + 1}`, x + 18, 462, { size: 22, weight: 800, color: COL_EV, font: MONO });
      text(`${c.from}→${c.to} $${c.amt}`, x + 100, 500, { size: 28, weight: 700, font: MONO, align: 'center' });
      ctx.restore();
    }
    k++;
  });
  arrow(1650, 304, 1650, 392, { color: MUTE, a: ma * (lt > T[0] ? 1 : 0.3), head: 10, w: 3 });
  // 状态（派生）
  const sa = F(lt, 16.6, 17.4);
  const n = Math.min(3, evCount);
  const st = replay(3);
  const cur = { ...START }; EVS.slice(0, 0);
  for (let i = 0; i < n; i++) { cur[EVS[i].from] -= EVS[i].amt; cur[EVS[i].to] += EVS[i].amt; }
  const pa = F(lt, 9.2, 10.0);
  glass(830, 590, 970, 250, { a: pa, accent: COL_EV, r: 24 });
  text('状态 = 事件作用的结果（派生）', 862, 636, { size: 26, weight: 700, a: pa });
  text('初始余额为示意', 1620, 636, { size: 20, color: DIM, align: 'right', a: pa });
  balanceBars(862, 668, cur, pa, { w: 620 });
  if (sa > 0) {
    ctx.save(); ctx.globalAlpha *= sa; ctx.strokeStyle = OK; ctx.lineWidth = 3; glow(OK, 14); rr(826, 586, 978, 258, 26); ctx.stroke(); ctx.restore();
  }
  bullet(0, '命令：想做的事，可能失败', F(lt, 5.0, 5.6));
  bullet(1, '事件：已发生的事实', F(lt, 12.4, 13.0), { color: COL_EV });
  bullet(2, '状态：由事件得出的结果', F(lt, 16.4, 17.0), { color: OK });
  statCard(110, 700, 640, '被拒绝的命令', '不产生事件', { color: RED, a: F(lt, 14.0, 14.8), h: 100 });
}

// ───────── 8 重放：任意时刻、对比版本、快照 ─────────
function sceneReplay(lt) {
  header(lt, '08', '可重现性', OK, '重放事件，重建任意时刻');
  // 时间轴：8 个事件
  const X0 = 830, EW = 118;
  const ta = F(lt, 0.9, 1.6);
  const target = 5;
  const head = lt < 10 ? lerp(0, target, eIO(P(lt, 4.0, 8.4))) : target;
  const snapAt = 5;
  const snapOn = lt > 17.4;
  const fromSnap = lt > 19.0;
  EVS.forEach((e, i) => {
    const x = X0 + i * EW, a = ta * (lt > 2.4 + i * 0.1 ? 1 : F(lt, 1.0 + i * 0.1, 1.8 + i * 0.1));
    const done = head > i + 0.5;
    const skipped = fromSnap && i < snapAt;
    glass(x, 200, EW - 14, 92, { r: 16, a: a * (skipped ? 0.35 : 1), accent: done ? COL_EV : null, fill: done ? 0.14 : 0.05 });
    text(`E${i + 1}`, x + (EW - 14) / 2, 236, { size: 24, weight: 800, font: MONO, color: done ? COL_EV : MUTE, align: 'center', a: a * (skipped ? 0.4 : 1) });
    text(`${e.from}→${e.to}`, x + (EW - 14) / 2, 272, { size: 20, font: MONO, color: MUTE, align: 'center', a: a * (skipped ? 0.4 : 1) });
  });
  // 播放头
  if (lt > 3.6) {
    const hx = X0 + Math.min(head, 8) * EW - 7;
    ctx.save(); ctx.globalAlpha *= F(lt, 3.6, 4.2); ctx.fillStyle = OK; glow(OK, 14); rr(hx - 3, 186, 6, 120, 3); ctx.fill(); ctx.restore();
    text('重放到 E5', X0 + 5 * EW - 7, 340, { size: 24, weight: 700, color: OK, align: 'center', a: F(lt, 8.0, 8.6) * (1 - F(lt, 16.8, 17.2)) });
  }
  // 快照标记
  if (snapOn) {
    const sx = X0 + snapAt * EW - 7;
    ctx.save(); ctx.globalAlpha *= F(lt, 17.4, 18.0); ctx.strokeStyle = SC[0]; ctx.lineWidth = 3; ctx.setLineDash([6, 6]); glow(SC[0], 10);
    ctx.beginPath(); ctx.moveTo(sx, 190); ctx.lineTo(sx, 310); ctx.stroke(); ctx.restore();
    text('快照 @E5', sx, 340, { size: 24, weight: 700, color: SC[0], align: 'center', a: F(lt, 17.4, 18.0) });
  }
  // 余额（随播放头）
  const n = Math.floor(head + 0.0001);
  const frac = head - n;
  const s = replay(Math.min(8, n));
  const ba = F(lt, 3.4, 4.2);
  glass(830, 380, 480, 240, { a: ba, accent: OK, r: 24 });
  text('重建的余额', 862, 424, { size: 24, color: MUTE, a: ba });
  balanceBars(862, 440, s, ba, { w: 280 });
  if (lt < 10) text(`已重放 ${n} 个事件`, 1070, 424, { size: 22, color: OK, weight: 700, font: MONO, a: ba });
  // 版本对比
  const va = F(lt, 10.8, 11.6);
  if (va > 0) {
    glass(1340, 380, 460, 240, { a: va, accent: COL_COORD, r: 24 });
    text('同一批事件 · 两个版本', 1370, 424, { size: 24, color: MUTE, a: va });
    const rp = P(lt, 12.0, 14.0), nn = Math.floor(rp * 8);
    ['旧代码 v1', '新代码 v2'].forEach((v, i) => {
      const y = 460 + i * 76;
      text(v, 1370, y + 30, { size: 26, weight: 700, color: i ? SC[3] : COL_COORD, a: va });
      const sv = replay(nn);
      text(`A${sv.A} B${sv.B} C${sv.C}`, 1560, y + 30, { size: 26, weight: 700, font: MONO, a: va });
    });
    if (lt > 14.4) { tick(1392, 600, OK, 14, F(lt, 14.4, 14.9)); }
    text('结果一致', 1420, 606, { size: 26, weight: 800, color: OK, a: F(lt, 14.4, 14.9) });
  }
  text('重放 = 从初始余额起，依次套用每个事件', 830, 690, { size: 28, weight: 600, color: MUTE, a: F(lt, 4.6, 5.4) * (1 - F(lt, 16.6, 17.0)) });
  // 快照：需重放事件数
  const need = fromSnap ? Math.round(lerp(8, 3, eIO(P(lt, 19.0, 19.8)))) : 8;
  const qa = F(lt, 17.0, 17.8);
  if (qa > 0) {
    glass(830, 660, 970, 150, { a: qa, accent: SC[0], r: 24 });
    text('恢复所需重放的事件数', 862, 706, { size: 24, color: MUTE, a: qa });
    text(`${need} / 8`, 862, 780, { size: 64, weight: 800, font: MONO, color: fromSnap && lt > 19.8 ? OK : INK, a: qa });
    text(fromSnap && lt > 19.8 ? '从快照之后接着重放 E6–E8' : '没有快照：从头 E1 重放', 1130, 776, { size: 28, weight: 600, color: fromSnap ? SC[0] : MUTE, a: qa });
  }
  bullet(0, '任意时刻：重放到那一刻', F(lt, 3.4, 4.0));
  bullet(1, '改了代码：新旧版本比对', F(lt, 10.6, 11.2), { color: COL_COORD });
  bullet(2, '快照 + 之后的事件', F(lt, 17.2, 17.8), { color: SC[0] });
  text('示意数据；快照应绑定已应用事件序号', 110, 640, { size: 22, color: DIM, a: F(lt, 18.6, 19.4) });
  void frac;
}

// ───────── 9 高性能与高可用：Raft、CQRS、分片 ─────────
function raftNode(x, y, label, color, { a = 1, dead = false, leader = false, w = 200, h = 130 } = {}) {
  if (a <= 0) return;
  ctx.save(); ctx.globalAlpha *= a;
  glass(x, y, w, h, { accent: dead ? RED : color });
  text(label, x + w / 2, y + 52, { size: 28, weight: 800, align: 'center', color: dead ? RED : color });
  text(dead ? '宕机' : leader ? 'leader' : 'follower', x + w / 2, y + 92, { size: 22, color: dead ? RED : MUTE, align: 'center', font: MONO });
  ctx.restore();
}
function sceneHA(lt) {
  header(lt, '09', '高性能与高可用', SC[0], '本地存储 · Raft · CQRS · 分片');
  const ph1 = P(lt, 0.7, 7.2) < 1 ? 1 : 0;
  // ── 阶段一：单机本地存储
  const a1 = F(lt, 1.0, 1.8) * (1 - F(lt, 7.6, 8.4));
  if (a1 > 0) {
    ctx.save(); ctx.globalAlpha *= a1;
    glass(870, 250, 900, 480, { accent: SC[0], r: 28 });
    text('单个节点（有状态）', 904, 306, { size: 30, weight: 800, color: SC[0] });
    [['命令 / 事件', '追加写本地磁盘，不走网络', COL_EV, 3.0], ['最近数据', '内存缓存（mmap）', SC[3], 4.4], ['状态', '本地 RocksDB（LSM，写优化）', COL_A, 5.6]].forEach(([n, s, c, t0], i) => {
      const y = 340 + i * 118, ra = F(lt, t0, t0 + 0.7);
      glass(904, y, 832, 96, { a: ra, accent: c, r: 20 });
      text(n, 936, y + 42, { size: 30, weight: 800, color: c, a: ra });
      text(s, 936, y + 78, { size: 24, color: MUTE, a: ra });
    });
    ctx.restore();
  }
  // ── 阶段二：Raft 三副本
  const a2 = F(lt, 8.0, 8.8) * (1 - F(lt, 15.6, 16.4));
  if (a2 > 0) {
    ctx.save(); ctx.globalAlpha *= a2;
    const L = [1180, 340], F1 = [900, 620], F2 = [1460, 620];
    const dead2 = lt > 12.6;
    raftNode(L[0], L[1], '节点 1', COL_A, { leader: true, w: 240, h: 130 });
    raftNode(F1[0], F1[1], '节点 2', COL_A, { w: 240, h: 130 });
    raftNode(F2[0], F2[1], '节点 3', COL_A, { w: 240, h: 130, dead: dead2 });
    [[L, F1], [L, F2]].forEach(([p, q], k) => {
      const x1 = p[0] + 120, y1 = p[1] + 130, x2 = q[0] + 120, y2 = q[1];
      arrow(x1, y1, x2, y2, { color: 'rgba(255,255,255,0.18)', w: 2.5, head: 10 });
      if (!(k === 1 && dead2)) { lpacket(x1, y1, x2, y2, P(lt, 9.8 + k * 0.3, 11.0 + k * 0.3), 'E', COL_EV, { dy: -18 }); }
      if (k === 1 && lt > 9.4 && lt < 12.6) lpacket(x1, y1, x2, y2, P(lt, 11.8, 12.6), 'E', COL_EV, { dy: -18 });
    });
    if (dead2) { cross(F2[0] + 120, F2[1] - 60, RED, 20, F(lt, 12.6, 13.0)); }
    text('事件复制到多个节点，顺序一致', 870, 250, { size: 28, weight: 700, color: COL_EV, a: F(lt, 9.2, 10.0) });
    const ma = F(lt, 13.6, 14.4);
    if (ma > 0) { glass(1340, 330, 440, 100, { r: 20, accent: OK, a: ma }); text('3 中 2 个存活 = 多数 ✓', 1560, 392, { size: 28, weight: 800, color: OK, align: 'center', a: ma }); }
    ctx.restore();
  }
  // ── 阶段三：CQRS + 反向代理 + 推送
  const a3 = F(lt, 16.6, 17.4) * (1 - F(lt, 21.4, 22.2));
  if (a3 > 0) {
    ctx.save(); ctx.globalAlpha *= a3;
    const Y = 420, items = [[830, '客户端', MUTE], [1060, '反向代理', COL_COORD], [1330, 'Raft 组', COL_A], [1580, '只读状态机', SC[3]]];
    const ws = [170, 190, 190, 230];
    items.forEach(([x, n, c], i) => { box(x, Y, ws[i], 110, n, { color: c, size: 26 }); });
    [[1000, 1060], [1250, 1330], [1520, 1580]].forEach(([a, b]) => arrow(a + 4, Y + 55, b - 4, Y + 55, { color: 'rgba(255,255,255,0.25)', w: 3, head: 11 }));
    lpacket(1000, Y + 55, 1060, Y + 55, P(lt, 17.8, 18.4), '', COL_C);
    lpacket(1250, Y + 55, 1330, Y + 55, P(lt, 18.4, 19.0), '', COL_C);
    lpacket(1520, Y + 55, 1580, Y + 55, P(lt, 19.0, 19.6), '', COL_EV);
    text('命令 →', 830, Y - 24, { size: 24, weight: 700, color: COL_C, a: F(lt, 17.6, 18.2) });
    // 推送回程
    const pa = F(lt, 19.4, 20.2);
    const py = Y + 200;
    arrow(1695, Y + 120, 1695, py, { color: OK, a: pa, w: 3, head: 10 });
    arrow(1695, py, 1160, py, { color: OK, a: pa, w: 3, head: 10, p: eOut(P(lt, 19.6, 20.6)) });
    arrow(1160, py, 1160, Y + 120, { color: OK, a: pa * (lt > 20.4 ? 1 : 0), w: 3, head: 10 });
    text('只读状态机主动推送结果，不用客户端轮询', 960, py + 56, { size: 26, weight: 700, color: OK, a: F(lt, 20.0, 20.8) });
    ctx.restore();
  }
  // ── 阶段四：多个 Raft 组
  const a4 = F(lt, 22.4, 23.2);
  if (a4 > 0) {
    ctx.save(); ctx.globalAlpha *= a4;
    box(1070, 190, 440, 96, 'Saga / TC/C 协调者', { color: COL_COORD, size: 28 });
    const gx = [830, 1130, 1430];
    gx.forEach((x, i) => {
      const c = [COL_A, COL_C, SC[0]][i];
      glass(x, 480, 300, 250, { r: 24, accent: c, a: F(lt, 23.4 + i * 0.4, 24.2 + i * 0.4) });
      text(`Raft 组 ${i + 1}`, x + 150, 524, { size: 28, weight: 800, align: 'center', color: c, a: F(lt, 23.4 + i * 0.4, 24.2 + i * 0.4) });
      for (let k = 0; k < 3; k++) { const ra = F(lt, 23.8 + i * 0.4, 24.4 + i * 0.4); ctx.save(); ctx.globalAlpha *= ra; dot(x + 70 + k * 80, 620, 24, c, { g: 12 }); ctx.restore(); }
      text('3 副本', x + 150, 695, { size: 22, color: MUTE, align: 'center', font: MONO, a: F(lt, 24.0, 24.6) });
      arrow(1290 + (i - 1) * 90, 290, x + 150, 476, { color: 'rgba(255,255,255,0.25)', w: 2.5, head: 10, a: F(lt, 24.6 + i * 0.3, 25.4 + i * 0.3) });
    });
    ctx.restore();
    lpacket(1260, 290, 980, 476, P(lt, 25.6, 26.6), 'A −1', SC[3]);
    lpacket(1380, 290, 1280, 476, P(lt, 26.8, 27.8), 'C +1', SC[3]);
  }
  bullet(0, '本地磁盘 + 内存缓存', F(lt, 1.6, 2.2));
  bullet(1, 'Raft：多数派复制事件', F(lt, 8.4, 9.0), { color: COL_EV });
  bullet(2, 'CQRS：只读状态机推送', F(lt, 16.8, 17.4), { color: SC[3] });
  bullet(3, '多 Raft 组 + TC/C / Saga', F(lt, 22.6, 23.2), { color: COL_C });
}

// ───────── 总结 ─────────
function sceneEnd(lt) {
  text('数字钱包', 110, 250, { size: 84, weight: 900, a: F(lt, 0.2, 0.9) });
  text('Digital Wallet', 112, 304, { size: 32, color: MUTE, font: MONO, a: F(lt, 0.4, 1.1) });
  [['事务', '跨分片：2PC · TC/C · Saga', COL_C], ['事件', '只追加，是唯一事实', COL_EV], ['重放', '重建余额 · 审计 · 对比', OK]].forEach(([w, s, c], k) => {
    const t0 = 1.2 + k * 1.5, p = eBack(P(lt, t0, t0 + 0.7)), a = clamp(p * 2);
    ctx.save(); ctx.globalAlpha *= a; ctx.translate(0, (1 - clamp(p)) * 30);
    const x = 110 + k * 560;
    glass(x, 420, 520, 230, { accent: c, r: 28 });
    ctx.fillStyle = c; glow(c, 20); rr(x + 36, 420, 80, 5, 3); ctx.fill(); ctx.shadowBlur = 0;
    text(`0${k + 1}`, x + 36, 480, { size: 22, color: c, font: MONO, weight: 700, ls: 3 });
    text(w, x + 36, 566, { size: 70, weight: 800 });
    text(s, x + 36, 620, { size: 26, color: MUTE });
    ctx.restore();
  });
  text('余额是结果，事件才是历史', 110, 750, { size: 34, weight: 700, color: INK, a: F(lt, 6.0, 6.8) });
  text('单组靠共识，多组靠事务；快照省时间，对账查正确性', 110, 810, { size: 26, color: MUTE, a: F(lt, 7.0, 7.8) });
}

export const scenes = { title: sceneTitle, scale: sceneScale, atomic: sceneAtomic, twopc: sceneTwoPC, tcc: sceneTCC, saga: sceneSaga, compare: sceneCompare, es: sceneES, replay: sceneReplay, ha: sceneHA, end: sceneEnd };
