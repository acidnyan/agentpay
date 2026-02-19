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
        <div class="btns" style="margin-top:0">
          <button id="tabPay" type="button" class="primary">支払い</button>
          <button id="tabCreate" type="button">請求作成</button>
        </div>
        <div class="small" style="margin-top:8px">支払い / 請求作成 を切り替えできます。</div>
      </div>

      <div id="toast" class="pill" style="display:none; position:fixed; left:50%; bottom:16px; transform:translateX(-50%); z-index:9999; justify-content:center; background:#0f1320; max-width:90%; text-align:center"></div>

      <div id="panelPay" class="card">
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
        <div class="muted" style="margin-bottom:8px">支払い確認（Txハッシュ照合: 宛先/金額の一致判定つき）</div>
        <div class="row">
          <input id="verifyTx" class="mono" placeholder="0x...（66文字）" />
          <button id="verifyBtn">確認する</button>
        </div>
        <div id="verifyResult" class="small" style="margin-top:8px"></div>

        <div class="sep"></div>
        <div class="muted">
          このページは <span class="mono">Base</span> 上の <span class="mono">USDC</span> 支払い用です（資金を預かりません）。
          送金は不可逆なので、宛先と金額を確認してから実行してください。
        </div>
        <div class="small" style="margin-top:10px">
          USDC contract (Base): <span class="mono">${USDC}</span>
        </div>
      </div>

      <div id="panelCreate" class="card" style="display:none">
        <div class="muted" style="margin-bottom:8px">請求作成（Invoice Creator）</div>
        <div class="row">
          <div class="col">
            <label>to</label>
            <input id="invTo" class="mono" placeholder="0x..." />
          </div>
          <div class="col">
            <label>amount (USDC)</label>
            <input id="invAmount" class="mono" placeholder="10" inputmode="decimal" />
          </div>
        </div>
        <div class="row" style="margin-top:10px">
          <div class="col" style="min-width:100%">
            <label>memo (optional)</label>
            <input id="invMemo" placeholder="task-123" />
          </div>
        </div>

        <div class="row" style="margin-top:10px">
          <div class="col">
            <label>支払い側で金額を編集</label>
            <div class="btns" style="margin-top:0">
              <button id="amtFlex" type="button">OFF（固定）</button>
            </div>
            <div class="small">ONで金額のみ編集可（宛先/メモは固定）。</div>
          </div>
        </div>

        <div class="btns">
          <button id="gen" class="primary">請求リンク生成</button>
          <button id="lock">ロック: OFF</button>
          <button id="apply">この請求をフォームに反映</button>
        </div>
        <div class="small" id="modeHint" style="margin-top:8px">モード: 固定金額（amount編集不可）</div>
        <div class="muted" style="margin-top:10px">生成された請求リンク</div>
        <div class="row">
          <input id="invoiceUrl" class="mono" readonly />
          <button id="copyInvoice">URLコピー</button>
          <a id="openInvoice" class="btn" target="_blank" rel="noreferrer">開く</a>
        </div>
        <div class="small" style="margin-top:8px">ロック中は支払いフォームを編集不可にして誤送金を防ぎます（任意金額ONならamountだけ編集可）。</div>
      </div>

      <div class="card">
        <div class="muted" style="margin-bottom:8px">ページURL（このページのトップ）</div>
        <div class="row">
          <input id="pageUrl" class="mono" readonly />
          <button id="copyPage">URLコピー</button>
        </div>
        <div class="small" style="margin-top:8px">パラメータ無しのURL。案内・ブックマーク用。</div>
      </div>

      <div class="card">
        <div class="muted" style="margin-bottom:8px">共有用リンク（現在のURL / パラメータ付き）</div>
        <div class="row">
          <input id="share" class="mono" readonly />
          <button id="copyShare">URLコピー</button>
        </div>
        <div class="small" style="margin-top:8px">請求作成で生成した「請求リンク」は上の生成欄（invoiceUrl）を使うのが推奨。</div>
      </div>
    </div>
  `)
  );

  const $ = (id: string) => document.getElementById(id) as HTMLElement | null;

  const tabPayBtn = $('tabPay') as HTMLButtonElement;
  const tabCreateBtn = $('tabCreate') as HTMLButtonElement;
  const toastEl = $('toast')!;
  const panelPay = $('panelPay')!;
  const panelCreate = $('panelCreate')!;

  const toEl = $('to') as HTMLInputElement;
  const amountEl = $('amount') as HTMLInputElement;
  const memoEl = $('memo') as HTMLInputElement;
  const msgEl = $('msg')!;
  const txEl = $('tx')!;
  const balEl = $('bal')!;
  const errEl = $('err')!;
  const okEl = $('ok')!;
  const verifyTxEl = $('verifyTx') as HTMLInputElement;
  const verifyBtn = $('verifyBtn') as HTMLButtonElement;
  const verifyResultEl = $('verifyResult')!;
  const netPill = $('netPill')!;
  const payBtn = $('pay') as HTMLButtonElement;
  const pageUrlEl = $('pageUrl') as HTMLInputElement;
  const shareEl = $('share') as HTMLInputElement;
  const basescanEl = $('basescan') as HTMLAnchorElement;
  const openInCbw = $('openInCbw') as HTMLAnchorElement;

  // Invoice creator
  const invToEl = $('invTo') as HTMLInputElement;
  const invAmountEl = $('invAmount') as HTMLInputElement;
  const invMemoEl = $('invMemo') as HTMLInputElement;
  const invoiceUrlEl = $('invoiceUrl') as HTMLInputElement;
  const genBtn = $('gen') as HTMLButtonElement;
  const lockBtn = $('lock') as HTMLButtonElement;
  const applyBtn = $('apply') as HTMLButtonElement;
  const copyInvoiceBtn = $('copyInvoice') as HTMLButtonElement;
  const openInvoiceEl = $('openInvoice') as HTMLAnchorElement;
  const modeHintEl = $('modeHint')!;
  const amtFlexBtn = $('amtFlex') as HTMLButtonElement;

  const connectBtn = $('connect') as HTMLButtonElement;
  const disconnectBtn = $('disconnect') as HTMLButtonElement;
  const copyBtn = $('copy') as HTMLButtonElement;
  const copyPageBtn = $('copyPage') as HTMLButtonElement;
  const copyShareBtn = $('copyShare') as HTMLButtonElement;

  type Tab = 'pay' | 'create';
  let activeTab: Tab = 'pay';

  function setTab(tab: Tab) {
    activeTab = tab;
    const payOn = tab === 'pay';
    panelPay.style.display = payOn ? 'block' : 'none';
    panelCreate.style.display = payOn ? 'none' : 'block';
    tabPayBtn.classList.toggle('primary', payOn);
    tabCreateBtn.classList.toggle('primary', !payOn);
    // Keep URL in sync (no reload)
    const u = new URL(location.href);
    u.searchParams.set('tab', tab);
    history.replaceState(null, '', u.toString());
  }

  function showErr(msg: string) {
    errEl.style.display = msg ? 'block' : 'none';
    errEl.textContent = msg || '';
  }
  let toastTimer: number | null = null;
  function toast(msg: string) {
    if (toastTimer) window.clearTimeout(toastTimer);
    toastEl.style.display = msg ? 'inline-flex' : 'none';
    toastEl.textContent = msg || '';
    if (msg) toastTimer = window.setTimeout(() => {
      toastEl.style.display = 'none';
      toastEl.textContent = '';
      toastTimer = null;
    }, 2500);
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

  let invoiceLocked = false;
  let flexAmount = false;

  function setLockUI() {
    lockBtn.textContent = `ロック: ${invoiceLocked ? 'ON' : 'OFF'}`;
    // Lock payment form inputs; allow amount edit if flexAmount=true
    toEl.readOnly = invoiceLocked;
    amountEl.readOnly = invoiceLocked && !flexAmount;
    memoEl.readOnly = invoiceLocked;

    amtFlexBtn.textContent = flexAmount ? 'ON（任意金額）' : 'OFF（固定）';
    modeHintEl.textContent = flexAmount
      ? 'モード: 任意金額（amount編集可 / to,memo固定）'
      : 'モード: 固定金額（amount編集不可）';
  }

  function buildInvoiceUrl(to: string, amount: string, memo: string): string {
    const u = new URL(location.href);
    u.searchParams.set('tab', 'pay');
    u.searchParams.set('lock', '1');
    if (flexAmount) u.searchParams.set('flexAmount', '1');
    else u.searchParams.delete('flexAmount');

    u.searchParams.set('to', to);
    u.searchParams.set('amount', amount);
    if (memo) u.searchParams.set('memo', memo);
    else u.searchParams.delete('memo');
    return u.toString();
  }

  function refresh() {
    const to = toEl.value.trim();
    const amount = amountEl.value.trim();
    const memo = memoEl.value.trim();

    showErr('');

    basescanEl.href = isHexAddress(to) ? `https://basescan.org/address/${to}` : 'https://basescan.org/';

    const units = usdcToUnits(amount);
    const valid = isHexAddress(to) && units !== null;

    // Page URL (no params)
    pageUrlEl.value = `${location.origin}${location.pathname}`;

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

  function isTxHash(h: string): boolean {
    return /^0x[0-9a-fA-F]{64}$/.test(h);
  }

  async function verifyTx() {
    const hash = verifyTxEl.value.trim();
    if (!isTxHash(hash)) {
      verifyResultEl.innerHTML = '<span class="warn">Txハッシュ形式が不正です。</span>';
      return;
    }

    const expectedTo = toEl.value.trim().toLowerCase();
    const expectedUnits = usdcToUnits(amountEl.value.trim());

    verifyResultEl.textContent = '照合中…';
    try {
      const body = {
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_getTransactionReceipt',
        params: [hash],
      };
      const res = await fetch('https://mainnet.base.org', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      const rcpt = json?.result;
      if (!rcpt) {
        verifyResultEl.innerHTML = `未確認（pending か未検出）: <a target="_blank" rel="noreferrer" href="https://basescan.org/tx/${hash}">BaseScanで確認</a>`;
        return;
      }

      const ok = rcpt.status === '0x1';
      const transferTopic = ethers.id('Transfer(address,address,uint256)').toLowerCase();
      let matchedTo = false;
      let matchedAmount = false;
      let foundTransfer = false;

      if (Array.isArray(rcpt.logs)) {
        for (const l of rcpt.logs) {
          if ((l?.address || '').toLowerCase() !== USDC.toLowerCase()) continue;
          if (!Array.isArray(l?.topics) || l.topics.length < 3) continue;
          if ((l.topics[0] || '').toLowerCase() !== transferTopic) continue;

          foundTransfer = true;
          const toTopic = String(l.topics[2] || '').toLowerCase();
          const toAddr = `0x${toTopic.slice(-40)}`;
          const rawData = typeof l.data === 'string' ? l.data : '0x0';
          let value = 0n;
          try {
            value = BigInt(rawData);
          } catch {
            value = 0n;
          }

          if (isHexAddress(expectedTo) && toAddr === expectedTo) matchedTo = true;
          if (expectedUnits !== null && value === expectedUnits) matchedAmount = true;
        }
      }

      const statusText = ok ? '成功' : '失敗';
      const transferText = foundTransfer ? 'USDC Transferログあり' : 'USDC Transferログ未検出';
      const toText = isHexAddress(expectedTo) ? (matchedTo ? '宛先一致' : '宛先不一致') : '宛先未入力';
      const amountText = expectedUnits !== null ? (matchedAmount ? '金額一致' : '金額不一致') : '金額未入力';
      const verifyOk = ok && foundTransfer && (!isHexAddress(expectedTo) || matchedTo) && (expectedUnits === null || matchedAmount);
      const judge = verifyOk ? '<b style="color:var(--ok)">検証OK</b>' : '<b style="color:var(--danger)">要確認</b>';

      verifyResultEl.innerHTML = `${judge} / 実行: <b>${statusText}</b> / ${transferText} / ${toText} / ${amountText} / block: <span class="mono">${parseInt(rcpt.blockNumber || '0x0', 16)}</span> / <a target="_blank" rel="noreferrer" href="https://basescan.org/tx/${hash}">BaseScan</a>`;
    } catch (e: any) {
      verifyResultEl.innerHTML = `<span class="warn">照合失敗: ${e?.message || String(e)}</span>`;
    }
  }

  function init() {
    const p = new URL(location.href).searchParams;
    const defTo = p.get('to') || '0x05BFC95c50750A2B530F5D1Ecb949F05Bfb764EC';
    const defAmount = p.get('amount') || '';
    const defMemo = p.get('memo') || '';

    // Tab: allow `tab=create` to open creator first
    const tabParam = p.get('tab');
    setTab(tabParam === 'create' ? 'create' : 'pay');

    // Lock via URL param
    invoiceLocked = p.get('lock') === '1';
    flexAmount = p.get('flexAmount') === '1';

    toEl.value = defTo;
    amountEl.value = defAmount;
    memoEl.value = defMemo;

    // Invoice creator defaults from current values
    invToEl.value = defTo;
    invAmountEl.value = defAmount;
    invMemoEl.value = defMemo;
    invoiceUrlEl.value = (isHexAddress(defTo) && defAmount) ? buildInvoiceUrl(defTo, defAmount, defMemo) : '';
    updateInvoiceButtons();

    openInCbw.href = buildCbwDappLink(location.href);

    setLockUI();
    refresh();
    setPill();
  }

  tabPayBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); setTab('pay'); setMsg('tab: pay'); });
  tabCreateBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); setTab('create'); setMsg('tab: create'); });

  connectBtn.onclick = () => void connect().catch((e) => showErr(e?.message || String(e)));
  disconnectBtn.onclick = () => void disconnect();
  (payBtn as HTMLButtonElement).onclick = () => void pay();

  // Invoice creator actions
  function updateInvoiceButtons() {
    const has = !!invoiceUrlEl.value;
    copyInvoiceBtn.disabled = !has;
    openInvoiceEl.style.pointerEvents = has ? 'auto' : 'none';
    openInvoiceEl.style.opacity = has ? '1' : '.55';
    openInvoiceEl.href = has ? invoiceUrlEl.value : '#';
  }

  genBtn.onclick = async () => {
    const to = invToEl.value.trim();
    const amount = invAmountEl.value.trim();
    const memo = invMemoEl.value.trim();
    if (!isHexAddress(to)) return showErr('Invoice to が不正です。');
    if (usdcToUnits(amount) === null) return showErr('Invoice amount が不正です（小数は6桁まで）。');
    invoiceUrlEl.value = buildInvoiceUrl(to, amount, memo);
    updateInvoiceButtons();
    toast('請求リンクを生成しました');
    toast('コピー中…');
    try {
      await navigator.clipboard.writeText(invoiceUrlEl.value);
      toast('請求リンクをコピーしました');
    } catch {
      showErr('コピーに失敗しました（ブラウザ権限の可能性）。');
      toast('コピー失敗');
    }
  };

  amtFlexBtn.onclick = () => {
    flexAmount = !flexAmount;
    setLockUI();
  };

  lockBtn.onclick = () => {
    invoiceLocked = !invoiceLocked;
    setLockUI();
  };

  applyBtn.onclick = () => {
    toEl.value = invToEl.value.trim();
    amountEl.value = invAmountEl.value.trim();
    memoEl.value = invMemoEl.value.trim();
    refresh();
  };

  copyInvoiceBtn.onclick = async () => {
    if (!invoiceUrlEl.value) return;
    toast('コピー中…');
    try {
      await navigator.clipboard.writeText(invoiceUrlEl.value);
      toast('請求リンクをコピーしました');
    } catch {
      showErr('コピーに失敗しました（ブラウザ権限の可能性）。');
      toast('コピー失敗');
    }
  };

  copyBtn.onclick = async () => {
    const to = toEl.value.trim();
    const amount = amountEl.value.trim();
    const memo = memoEl.value.trim();
    const text = `to: ${to}\namount(USDC): ${amount}${memo ? `\nmemo: ${memo}` : ''}`;
    toast('コピー中…');
    try {
      await navigator.clipboard.writeText(text);
      toast('コピーしました');
    } catch (e) {
      showErr('コピーに失敗しました（ブラウザ権限の可能性）。');
      toast('コピー失敗');
    }
  };

  copyPageBtn.onclick = async () => {
    toast('コピー中…');
    try {
      await navigator.clipboard.writeText(pageUrlEl.value);
      toast('ページURLをコピーしました');
    } catch {
      showErr('コピーに失敗しました（ブラウザ権限の可能性）。');
      toast('コピー失敗');
    }
  };

  copyShareBtn.onclick = async () => {
    toast('コピー中…');
    try {
      await navigator.clipboard.writeText(shareEl.value);
      toast('URLをコピーしました');
    } catch {
      showErr('コピーに失敗しました（ブラウザ権限の可能性）。');
      toast('コピー失敗');
    }
  };

  verifyBtn.onclick = () => void verifyTx();
  verifyTxEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') void verifyTx();
  });

  toEl.addEventListener('input', () => { if (!invoiceLocked) refresh(); });
  amountEl.addEventListener('input', () => { if (!invoiceLocked) refresh(); });
  memoEl.addEventListener('input', () => { if (!invoiceLocked) refresh(); });

  init();
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
});
