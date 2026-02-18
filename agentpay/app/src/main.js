import EthereumProvider from '@walletconnect/ethereum-provider';
import { ethers } from 'ethers';

const WC_PROJECT_ID = '83569f52a2a1226834e65a28e4307fec';
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const CHAIN_ID = 8453;
const CHAIN_ID_HEX = '0x2105';

const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function transfer(address to, uint256 value) returns (bool)'
];

const css = `
:root{--bg:#0b0d10;--card:#141821;--fg:#e8eef7;--muted:#9aa7b5;--accent:#5eead4;--danger:#fb7185;--ok:#86efac;}
body{margin:0;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,"Noto Sans JP",Helvetica,Arial;background:var(--bg);color:var(--fg)}
.wrap{max-width:820px;margin:0 auto;padding:24px}
.h{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap}
h1{font-size:28px;margin:0}
.tag{font-size:12px;color:var(--muted);border:1px solid #273142;padding:3px 8px;border-radius:999px}
.card{background:var(--card);border:1px solid #273142;border-radius:14px;padding:16px;margin-top:16px}
.row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
label{display:block;font-size:12px;color:var(--muted);margin-bottom:6px}
input{width:100%;box-sizing:border-box;background:#0f1320;color:var(--fg);border:1px solid #273142;border-radius:10px;padding:10px 12px;font-size:14px}
.col{flex:1;min-width:220px}
.btns{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px}
button,a.btn{cursor:pointer;background:#0f1320;color:var(--fg);border:1px solid #273142;border-radius:12px;padding:10px 12px;font-size:14px;text-decoration:none;display:inline-flex;align-items:center;gap:8px}
button.primary,a.btn.primary{border-color:rgba(94,234,212,.45);box-shadow:0 0 0 1px rgba(94,234,212,.12) inset}
button.ok{border-color:rgba(134,239,172,.45)}
button:disabled{opacity:.55;cursor:not-allowed}
.mono{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace}
.muted{color:var(--muted);font-size:13px;line-height:1.5}
.warn{color:var(--danger);font-size:13px}
.good{color:var(--ok);font-size:13px}
.small{font-size:12px;color:var(--muted)}
.sep{height:1px;background:#273142;margin:14px 0}
.pill{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;border:1px solid #273142;color:var(--muted);font-size:12px}
`;

function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

function isHexAddress(a){ return /^0x[0-9a-fA-F]{40}$/.test(a); }

function usdcToUnits(str){
  const s = (str||'').trim();
  if(!s) return null;
  if(!/^\d+(\.\d+)?$/.test(s)) return null;
  const [i,f=''] = s.split('.');
  if(f.length>6) return null;
  const frac=(f+'000000').slice(0,6);
  return BigInt(i)*1000000n + BigInt(frac);
}

function buildShareUrl(to, amount, memo){
  const u=new URL(location.href);
  u.searchParams.set('to',to);
  u.searchParams.set('amount',amount);
  if(memo) u.searchParams.set('memo',memo); else u.searchParams.delete('memo');
  return u.toString();
}

function buildCbwDappLink(targetUrl){
  return `https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(targetUrl)}`;
}

async function main(){
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  const app = document.getElementById('app');
  app.appendChild(el(`
    <div class="wrap">
      <div class="h">
        <h1>AgentPay</h1>
        <div class="tag">Base USDC invoice link</div>
        <div id="netPill" class="pill" style="margin-left:auto">Wallet: not connected</div>
      </div>

      <div class="card">
        <div class="row">
          <div class="col">
            <label>支払い先 (to)</label>
            <input id="to" class="mono" placeholder="0x..." />
          </div>
          <div class="col">
            <label>金額 (USDC)</label>
            <input id="amount" class="mono" placeholder="10" inputmode="decimal" />
          </div>
        </div>
        <div class="row" style="margin-top:10px">
          <div class="col" style="min-width:100%">
            <label>メモ (任意)</label>
            <input id="memo" placeholder="task-123" />
          </div>
        </div>

        <div class="btns">
          <button id="connect" class="primary">ウォレット接続</button>
          <a id="openInCbw" class="btn" target="_blank" rel="noreferrer">Coinbase Walletで開く</a>
          <button id="disconnect">切断</button>
          <button id="pay" class="ok" disabled>支払う（USDC送金）</button>
          <button id="copy" class="primary">コピー（宛先/金額/メモ）</button>
          <a id="basescan" class="btn" target="_blank" rel="noreferrer">BaseScanで見る</a>
        </div>

        <div id="msg" class="muted" style="margin-top:10px">JS loaded. Ready.</div>
        <div id="bal" class="muted" style="margin-top:6px"></div>
        <div id="err" class="warn" style="margin-top:10px;display:none"></div>
        <div id="ok" class="good" style="margin-top:10px;display:none"></div>

        <div class="sep"></div>
        <div class="muted">
          このページは <span class="mono">Base</span> 上の <span class="mono">USDC</span> 支払い用です（資金を預かりません）。
          送金は不可逆なので、宛先と金額を確認してから実行してください。
        </div>
        <div class="small" style="margin-top:10px">
          USDC contract (Base): <span class="mono">${USDC}</span>
        </div>
      </div>

      <div class="card">
        <div class="muted" style="margin-bottom:8px">共有用リンク（このページのURL）</div>
        <div class="row">
          <input id="share" class="mono" readonly />
          <button id="copyShare">URLコピー</button>
        </div>
      </div>
    </div>
  `));

  const $ = (id) => document.getElementById(id);
  const toEl = $('to');
  const amountEl = $('amount');
  const memoEl = $('memo');
  const msgEl = $('msg');
  const balEl = $('bal');
  const errEl = $('err');
  const okEl = $('ok');
  const netPill = $('netPill');
  const payBtn = $('pay');
  const shareEl = $('share');
  const basescanEl = $('basescan');
  const openInCbw = $('openInCbw');

  function showErr(msg){ errEl.style.display = msg ? 'block' : 'none'; errEl.textContent = msg || ''; }
  function showOk(msg){ okEl.style.display = msg ? 'block' : 'none'; okEl.textContent = msg || ''; }
  function setMsg(msg){ msgEl.textContent = msg || ''; }
  function setBal(msg){ balEl.textContent = msg || ''; }
  function setBalHtml(html){ balEl.innerHTML = html || ''; }

  let wcProvider=null;
  let browserProvider=null;
  let signer=null;
  let connectedAddress=null;

  function setPill(){
    netPill.textContent = connectedAddress ? `Wallet: ${connectedAddress.slice(0,6)}…${connectedAddress.slice(-4)}` : 'Wallet: not connected';
  }

  let usdcDecimals = 6;
  let usdcBalanceUnits = 0n;

  function refresh(){
    const to=toEl.value.trim();
    const amount=amountEl.value.trim();
    const memo=memoEl.value.trim();
    showErr('');
    showOk('');
    basescanEl.href = isHexAddress(to) ? `https://basescan.org/address/${to}` : 'https://basescan.org/';
    const units=usdcToUnits(amount);
    const valid=isHexAddress(to) && units!==null;
    shareEl.value = (isHexAddress(to) && amount) ? buildShareUrl(to, amount, memo) : location.href;

    const hasBalance = (units !== null) ? (usdcBalanceUnits >= units) : false;
    // Disable pay if not connected, invalid, or insufficient balance
    payBtn.disabled = !(connectedAddress && valid && hasBalance);

    if(!isHexAddress(to)) showErr('宛先アドレス(to)が正しくありません。');
    else if(units===null) showErr('金額(USDC)が正しくありません（小数は6桁まで）。');
    else if(connectedAddress && !hasBalance) showErr('USDC残高が不足しています。');

    // Balance display
    if (!connectedAddress) {
      setBal('USDC残高: (未接続)');
    } else {
      const whole = (usdcBalanceUnits / 1000000n).toString();
      const frac = (usdcBalanceUnits % 1000000n).toString().padStart(6,'0').replace(/0+$/,'');
      const chainTxt = lastChainId ? `chainId: ${lastChainId}` : 'chainId: (unknown)';
      const errTxt = lastBalErr ? ` / balErr: ${lastBalErr}` : '';
      const basescan = `https://basescan.org/address/${connectedAddress}`;
      const holdings = `https://basescan.org/tokenholdings?a=${connectedAddress}`;

      const balText = `USDC残高: ${frac ? `${whole}.${frac}` : whole}`;
      const warn = (usdcBalanceUnits === 0n) ? '<br/><span class="warn">※BaseScan上でもUSDCが無い場合、MetaMask側の表示（別ネットワーク/キャッシュ/別アカウント）と食い違っている可能性があります。</span>' : '';

      setBalHtml(`${balText} / ${chainTxt}${errTxt}<br/>BaseScan: <a class="btn" style="padding:4px 8px" target="_blank" rel="noreferrer" href="${basescan}">address</a> <a class="btn" style="padding:4px 8px" target="_blank" rel="noreferrer" href="${holdings}">token holdings</a>${warn}`);
    }
  }

  async function ensureBaseInjected(){
    const eth = window.ethereum;
    if (!eth) return;
    const chainId = await eth.request({ method:'eth_chainId' });
    if(chainId===CHAIN_ID_HEX) return;
    try{ await eth.request({ method:'wallet_switchEthereumChain', params:[{chainId:CHAIN_ID_HEX}] }); }
    catch(e){
      if(e?.code===4902){
        await eth.request({ method:'wallet_addEthereumChain', params:[{chainId:CHAIN_ID_HEX, chainName:'Base', nativeCurrency:{name:'Ether',symbol:'ETH',decimals:18}, rpcUrls:['https://mainnet.base.org'], blockExplorerUrls:['https://basescan.org']}] });
      } else { throw e; }
    }
  }

  async function ensureBaseWc(){
    const chainId = await wcProvider.request({ method:'eth_chainId' });
    if(chainId===CHAIN_ID_HEX) return;
    try{ await wcProvider.request({ method:'wallet_switchEthereumChain', params:[{chainId:CHAIN_ID_HEX}] }); }
    catch(e){
      if(e?.code===4902){
        await wcProvider.request({ method:'wallet_addEthereumChain', params:[{chainId:CHAIN_ID_HEX, chainName:'Base', nativeCurrency:{name:'Ether',symbol:'ETH',decimals:18}, rpcUrls:['https://mainnet.base.org'], blockExplorerUrls:['https://basescan.org']}] });
      } else { throw e; }
    }
  }

  let lastChainId = null;
  let lastBalErr = null;

  async function updateUsdcBalance(){
    if (!connectedAddress || !browserProvider) {
      usdcBalanceUnits = 0n;
      lastBalErr = null;
      lastChainId = null;
      refresh();
      return;
    }
    try {
      // Ensure we're on Base before reading balance
      if (wcProvider) await ensureBaseWc(); else await ensureBaseInjected();

      // Capture chainId for debugging
      try {
        if (wcProvider) lastChainId = await wcProvider.request({ method: 'eth_chainId' });
        else lastChainId = await window.ethereum.request({ method: 'eth_chainId' });
      } catch {
        lastChainId = null;
      }

      const usdc = new ethers.Contract(USDC, ERC20_ABI, browserProvider);
      usdcDecimals = Number(await usdc.decimals());
      usdcBalanceUnits = await usdc.balanceOf(connectedAddress);
      lastBalErr = null;
    } catch (e) {
      usdcBalanceUnits = 0n;
      lastBalErr = e?.shortMessage || e?.message || String(e);
    }
    refresh();
  }

  async function connect(){
    showErr(''); showOk(''); setMsg('ウォレット接続中…');
    if(window.ethereum){
      try{
        await window.ethereum.request({method:'eth_requestAccounts'});
        await ensureBaseInjected();
        browserProvider = new ethers.BrowserProvider(window.ethereum);
        signer = await browserProvider.getSigner();
        connectedAddress = await signer.getAddress();
        setPill();
        setMsg('接続しました（Injected Wallet）。');
        await updateUsdcBalance();
        return;
      } catch(e){
        showErr(`Injected接続に失敗: ${e?.message||e}`);
      }
    }

    try{
      wcProvider = await EthereumProvider.init({ projectId: WC_PROJECT_ID, chains:[CHAIN_ID], optionalChains:[CHAIN_ID], showQrModal:true });
      await wcProvider.connect();
      browserProvider = new ethers.BrowserProvider(wcProvider);
      signer = await browserProvider.getSigner();
      connectedAddress = await signer.getAddress();
      await ensureBaseWc();
      setPill();
      setMsg('接続しました（WalletConnect）。');
      await updateUsdcBalance();
    } catch(e){
      showErr(`WalletConnect接続に失敗: ${e?.message||e}`);
      setMsg('');
    }
  }

  async function disconnect(){
    showErr(''); showOk(''); setMsg('');
    try{ await wcProvider?.disconnect(); }catch{}
    wcProvider=null; browserProvider=null; signer=null; connectedAddress=null;
    setPill(); refresh();
  }

  async function pay(){
    showErr(''); showOk('');
    const to=toEl.value.trim();
    const amount=amountEl.value.trim();
    const memo=memoEl.value.trim();
    const units=usdcToUnits(amount);
    if(!connectedAddress) return showErr('先にウォレット接続してください。');
    if(!isHexAddress(to)) return showErr('宛先(to)が不正です。');
    if(units===null) return showErr('金額が不正です。');
    if(usdcBalanceUnits < units) return showErr('USDC残高が不足しています。');
    if(to.toLowerCase() === connectedAddress.toLowerCase()) {
      showErr('注意: 宛先(to)が送金元と同じアドレスです（テスト用途ならOK）。');
    }

    setMsg('トランザクション作成中…');
    try{
      if(wcProvider) await ensureBaseWc(); else await ensureBaseInjected();

      const iface = new ethers.Interface(['function transfer(address to, uint256 value)']);
      const data = iface.encodeFunctionData('transfer', [to, units]);
      const txParams = { from: connectedAddress, to: USDC, data, value: '0x0' };

      let hash = null;
      if (wcProvider) {
        hash = await wcProvider.request({ method: 'eth_sendTransaction', params: [txParams] });
      } else if (window.ethereum?.request) {
        hash = await window.ethereum.request({ method: 'eth_sendTransaction', params: [txParams] });
      } else {
        throw new Error('No wallet provider available for sending transaction');
      }

      if (!hash || typeof hash !== 'string') {
        throw new Error('Wallet did not return a transaction hash (eth_sendTransaction failed or was blocked).');
      }

      const txUrl = `https://basescan.org/tx/${hash}`;
      showOk(`Tx submitted: ${hash}`);
      setMsg(`BaseScan: ${txUrl}`);

      await browserProvider.waitForTransaction(hash);

      showOk(`支払い完了: ${hash}`);
      setMsg(`BaseScan: ${txUrl}`);
      await updateUsdcBalance();

      if(memo){
        try { await navigator.clipboard.writeText(`memo: ${memo}\ntx: ${hash}`); } catch {}
      }
    } catch(e){
      showErr(e?.shortMessage || e?.message || String(e));
      setMsg('');
    }
  }

  function init(){
    const p=new URL(location.href).searchParams;
    toEl.value = p.get('to') || '0x05BFC95c50750A2B530F5D1Ecb949F05Bfb764EC';
    amountEl.value = p.get('amount') || '';
    memoEl.value = p.get('memo') || '';
    openInCbw.href = buildCbwDappLink(location.href);
    setPill();
    refresh();
  }

  $('connect').addEventListener('click', () => connect());
  $('disconnect').addEventListener('click', () => disconnect());
  $('pay').addEventListener('click', () => pay());
  $('copy').addEventListener('click', async()=>{
    const to=toEl.value.trim(); const amount=amountEl.value.trim(); const memo=memoEl.value.trim();
    const text=`to: ${to}\namount(USDC): ${amount}${memo?`\nmemo: ${memo}`:''}`;
    await navigator.clipboard.writeText(text);
  });
  $('copyShare').addEventListener('click', async()=>{
    await navigator.clipboard.writeText(shareEl.value);
  });
  toEl.addEventListener('input', refresh);
  amountEl.addEventListener('input', refresh);
  memoEl.addEventListener('input', refresh);

  init();
}

main();
