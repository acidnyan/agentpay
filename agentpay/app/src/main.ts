import EthereumProvider from '@walletconnect/ethereum-provider';
import { ethers } from 'ethers';

const WC_PROJECT_ID = '83569f52a2a1226834e65a28e4307fec';
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const CHAIN_ID = 8453;
const CHAIN_ID_HEX = '0x2105';

type LastTx = {
  hash: string;
  memo?: string;
  status?: 'submitted' | 'confirmed';
} | null;

declare global {
  interface Window {
    __agentpay_last_tx?: LastTx;
    ethereum?: {
      request?: (args: { method: string; params?: any[] }) => Promise<any>;
      on?: (event: string, handler: (...args: any[]) => void) => void;
    };
  }
}

const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
] as const;

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

function el(html: string): HTMLElement {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild as HTMLElement;
}

function isHexAddress(a: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(a);
}

function usdcToUnits(str: string): bigint | null {
  const s = (str || '').trim();
  if (!s) return null;
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const [i, f = ''] = s.split('.');
  if (f.length > 6) return null;
  const frac = (f + '000000').slice(0, 6);
  return BigInt(i) * 1000000n + BigInt(frac);
}

function buildShareUrl(to: string, amount: string, memo: string): string {
  const u = new URL(location.href);
  u.searchParams.set('to', to);
  u.searchParams.set('amount', amount);
  if (memo) u.searchParams.set('memo', memo);
  else u.searchParams.delete('memo');
  return u.toString();
}

function buildCbwDappLink(targetUrl: string): string {
  return `https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(targetUrl)}`;
}

async function main() {
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  const app = document.getElementById('app');
  if (!app) throw new Error('Missing #app');

  app.appendChild(
    el(`
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
        <div id="tx" class="muted" style="margin-top:6px"></div>
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
  `)
  );

  const $ = (id: string) => document.getElementById(id) as HTMLElement | null;

  const toEl = $('to') as HTMLInputElement;
  const amountEl = $('amount') as HTMLInputElement;
  const memoEl = $('memo') as HTMLInputElement;
  const msgEl = $('msg')!;
  const txEl = $('tx')!;
  const balEl = $('bal')!;
  const errEl = $('err')!;
  const okEl = $('ok')!;
  const netPill = $('netPill')!;
  const payBtn = $('pay') as HTMLButtonElement;
  const shareEl = $('share') as HTMLInputElement;
  const basescanEl = $('basescan') as HTMLAnchorElement;
  const openInCbw = $('openInCbw') as HTMLAnchorElement;

  const connectBtn = $('connect') as HTMLButtonElement;
  const disconnectBtn = $('disconnect') as HTMLButtonElement;
  const copyBtn = $('copy') as HTMLButtonElement;
  const copyShareBtn = $('copyShare') as HTMLButtonElement;

  function showErr(msg: string) {
    errEl.style.display = msg ? 'block' : 'none';
    errEl.textContent = msg || '';
  }
  function showOk(msg: string) {
    okEl.style.display = msg ? 'block' : 'none';
    okEl.textContent = msg || '';
  }
  function setMsg(msg: string) {
    msgEl.textContent = msg || '';
  }
  function setTxHtml(html: string) {
    txEl.innerHTML = html || '';
  }
  function setBalHtml(html: string) {
    balEl.innerHTML = html || '';
  }

  let wcProvider: any = null;
  let browserProvider: ethers.BrowserProvider | null = null;
  let signer: ethers.Signer | null = null;
  let connectedAddress: string | null = null;

  let usdcBalanceUnits: bigint = 0n;
  let lastChainId: string | null = null;
  let lastBalErr: string | null = null;

  function setPill() {
    netPill.textContent = connectedAddress
      ? `Wallet: ${connectedAddress.slice(0, 6)}…${connectedAddress.slice(-4)}`
      : 'Wallet: not connected';
  }

  async function ensureBaseInjected() {
    const eth = window.ethereum;
    if (!eth?.request) return;
    const chainId = await eth.request({ method: 'eth_chainId' });
    if (chainId === CHAIN_ID_HEX) return;
    try {
      await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_ID_HEX }] });
    } catch (e: any) {
      if (e?.code === 4902) {
        await eth.request({
          method: 'wallet_addEthereumChain',
          params: [
            {
              chainId: CHAIN_ID_HEX,
              chainName: 'Base',
              nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
              rpcUrls: ['https://mainnet.base.org'],
              blockExplorerUrls: ['https://basescan.org'],
            },
          ],
        });
      } else {
        throw e;
      }
    }
  }

  async function ensureBaseWc() {
    const chainId = await wcProvider.request({ method: 'eth_chainId' });
    if (chainId === CHAIN_ID_HEX) return;
    try {
      await wcProvider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_ID_HEX }] });
    } catch (e: any) {
      if (e?.code === 4902) {
        await wcProvider.request({
          method: 'wallet_addEthereumChain',
          params: [
            {
              chainId: CHAIN_ID_HEX,
              chainName: 'Base',
              nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
              rpcUrls: ['https://mainnet.base.org'],
              blockExplorerUrls: ['https://basescan.org'],
            },
          ],
        });
      } else {
        throw e;
      }
    }
  }

  async function updateUsdcBalance() {
    if (!connectedAddress || !browserProvider) {
      usdcBalanceUnits = 0n;
      lastChainId = null;
      lastBalErr = null;
      refresh();
      return;
    }

    try {
      if (wcProvider) await ensureBaseWc();
      else await ensureBaseInjected();

      try {
        if (wcProvider) lastChainId = await wcProvider.request({ method: 'eth_chainId' });
        else lastChainId = await window.ethereum?.request?.({ method: 'eth_chainId' });
      } catch {
        lastChainId = null;
      }

      const usdc = new ethers.Contract(USDC, ERC20_ABI, browserProvider);
      usdcBalanceUnits = (await usdc.balanceOf(connectedAddress)) as bigint;
      lastBalErr = null;
    } catch (e: any) {
      usdcBalanceUnits = 0n;
      lastBalErr = e?.shortMessage || e?.message || String(e);
    }

    refresh();
  }

  function refresh() {
    const to = toEl.value.trim();
    const amount = amountEl.value.trim();
    const memo = memoEl.value.trim();

    showErr('');

    basescanEl.href = isHexAddress(to) ? `https://basescan.org/address/${to}` : 'https://basescan.org/';

    const units = usdcToUnits(amount);
    const valid = isHexAddress(to) && units !== null;

    shareEl.value = (isHexAddress(to) && amount) ? buildShareUrl(to, amount, memo) : location.href;

    const hasBalance = units !== null ? usdcBalanceUnits >= units : false;
    payBtn.disabled = !(connectedAddress && valid && hasBalance);

    // Tx UI
    if (!window.__agentpay_last_tx) {
      setTxHtml('');
    } else {
      const { hash, memo: m, status } = window.__agentpay_last_tx;
      const url = `https://basescan.org/tx/${hash}`;
      const memoLine = m ? `<br/>memo: <span class="mono">${m}</span>` : '';
      const st = status ? `<span class="pill" style="margin-left:8px">${status}</span>` : '';
      setTxHtml(
        `Tx: <a class="btn" style="padding:4px 8px" target="_blank" rel="noreferrer" href="${url}">${hash.slice(0, 10)}…</a>${st}${memoLine} <button id="copyTx" style="padding:4px 8px">tx+memoコピー</button> <button id="clearTx" style="padding:4px 8px">クリア</button>`
      );
      setTimeout(() => {
        const b = document.getElementById('copyTx') as HTMLButtonElement | null;
        if (b)
          b.onclick = async () => {
            const text = `tx: ${hash}${m ? `\nmemo: ${m}` : ''}`;
            try {
              await navigator.clipboard.writeText(text);
            } catch {}
          };
        const c = document.getElementById('clearTx') as HTMLButtonElement | null;
        if (c)
          c.onclick = () => {
            window.__agentpay_last_tx = null;
            refresh();
          };
      }, 0);
    }

    // Balance UI
    if (!connectedAddress) {
      setBalHtml('USDC残高: (未接続)');
    } else {
      const whole = (usdcBalanceUnits / 1000000n).toString();
      const frac = (usdcBalanceUnits % 1000000n)
        .toString()
        .padStart(6, '0')
        .replace(/0+$/, '');
      const balText = `USDC残高: ${frac ? `${whole}.${frac}` : whole}`;
      const chainTxt = lastChainId ? `chainId: ${lastChainId}` : 'chainId: (unknown)';
      const errTxt = lastBalErr ? ` / balErr: ${lastBalErr}` : '';
      const addrScan = `https://basescan.org/address/${connectedAddress}`;
      const holdings = `https://basescan.org/tokenholdings?a=${connectedAddress}`;
      setBalHtml(
        `${balText} / ${chainTxt}${errTxt}<br/>BaseScan: <a class="btn" style="padding:4px 8px" target="_blank" rel="noreferrer" href="${addrScan}">address</a> <a class="btn" style="padding:4px 8px" target="_blank" rel="noreferrer" href="${holdings}">token holdings</a>`
      );
    }

    if (!isHexAddress(to)) showErr('宛先アドレス(to)が正しくありません。');
    else if (units === null) showErr('金額(USDC)が正しくありません（小数は6桁まで）。');
    else if (connectedAddress && !hasBalance) showErr('USDC残高が不足しています。');
  }

  async function connect() {
    showErr('');
    showOk('');
    setMsg('ウォレット接続中…');

    if (window.ethereum?.request) {
      try {
        await window.ethereum.request({ method: 'eth_requestAccounts' });
        await ensureBaseInjected();
        browserProvider = new ethers.BrowserProvider(window.ethereum as any);
        signer = await browserProvider.getSigner();
        connectedAddress = await (signer as any).getAddress();
        setPill();
        setMsg('接続しました（Injected Wallet）。');
        await updateUsdcBalance();
        return;
      } catch (e: any) {
        showErr(`Injected接続に失敗: ${e?.message || e}`);
      }
    }

    // WalletConnect fallback
    wcProvider = await EthereumProvider.init({
      projectId: WC_PROJECT_ID,
      chains: [CHAIN_ID],
      optionalChains: [CHAIN_ID],
      showQrModal: true,
    });
    await wcProvider.connect();
    browserProvider = new ethers.BrowserProvider(wcProvider);
    signer = await browserProvider.getSigner();
    connectedAddress = await (signer as any).getAddress();
    await ensureBaseWc();
    setPill();
    setMsg('接続しました（WalletConnect）。');
    await updateUsdcBalance();
  }

  async function disconnect() {
    showErr('');
    showOk('');
    setMsg('');
    try {
      await wcProvider?.disconnect();
    } catch {}
    wcProvider = null;
    browserProvider = null;
    signer = null;
    connectedAddress = null;
    setPill();
    refresh();
  }

  async function pay() {
    showErr('');
    showOk('');

    if (!connectedAddress) return showErr('先にウォレット接続してください。');

    const to = toEl.value.trim();
    const amount = amountEl.value.trim();
    const memo = memoEl.value.trim();
    const units = usdcToUnits(amount);

    if (!isHexAddress(to)) return showErr('宛先(to)が不正です。');
    if (units === null) return showErr('金額が不正です。');
    if (usdcBalanceUnits < units) return showErr('USDC残高が不足しています。');

    if (to.toLowerCase() === connectedAddress.toLowerCase()) {
      showErr('注意: 宛先(to)が送金元と同じアドレスです（テスト用途ならOK）。');
    }

    setMsg('トランザクション作成中…');

    try {
      if (wcProvider) await ensureBaseWc();
      else await ensureBaseInjected();

      const iface = new ethers.Interface(['function transfer(address to, uint256 value)']);
      const data = iface.encodeFunctionData('transfer', [to, units]);
      const txParams = { from: connectedAddress, to: USDC, data, value: '0x0' };

      const provider = wcProvider ? wcProvider : window.ethereum;
      const hash = await provider?.request?.({ method: 'eth_sendTransaction', params: [txParams] });

      if (!hash || typeof hash !== 'string') {
        throw new Error('Wallet did not return a transaction hash (eth_sendTransaction failed or was blocked).');
      }

      window.__agentpay_last_tx = { hash, memo, status: 'submitted' };
      refresh();

      showOk(`Tx submitted: ${hash}`);
      setMsg('confirm待ち…');

      await browserProvider!.waitForTransaction(hash);

      if (window.__agentpay_last_tx) window.__agentpay_last_tx.status = 'confirmed';
      refresh();

      showOk(`支払い完了: ${hash}`);
      setMsg('confirmed');
      await updateUsdcBalance();

      if (memo) {
        try {
          await navigator.clipboard.writeText(`memo: ${memo}\ntx: ${hash}`);
        } catch {}
      }
    } catch (e: any) {
      showErr(e?.shortMessage || e?.message || String(e));
      setMsg('');
    }
  }

  function init() {
    const p = new URL(location.href).searchParams;
    toEl.value = p.get('to') || '0x05BFC95c50750A2B530F5D1Ecb949F05Bfb764EC';
    amountEl.value = p.get('amount') || '';
    memoEl.value = p.get('memo') || '';

    openInCbw.href = buildCbwDappLink(location.href);

    refresh();
    setPill();
  }

  connectBtn.onclick = () => void connect().catch((e) => showErr(e?.message || String(e)));
  disconnectBtn.onclick = () => void disconnect();
  (payBtn as HTMLButtonElement).onclick = () => void pay();

  copyBtn.onclick = async () => {
    const to = toEl.value.trim();
    const amount = amountEl.value.trim();
    const memo = memoEl.value.trim();
    const text = `to: ${to}\namount(USDC): ${amount}${memo ? `\nmemo: ${memo}` : ''}`;
    await navigator.clipboard.writeText(text);
  };

  copyShareBtn.onclick = async () => {
    await navigator.clipboard.writeText(shareEl.value);
  };

  toEl.addEventListener('input', refresh);
  amountEl.addEventListener('input', refresh);
  memoEl.addEventListener('input', refresh);

  init();
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
});
