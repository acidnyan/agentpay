import { ethers } from 'ethers';

const WC_PROJECT_ID = '83569f52a2a1226834e65a28e4307fec';

const CHAIN_CONFIGS = {
  base: {
    key: 'base',
    label: 'Base',
    chainId: 8453,
    chainIdHex: '0x2105',
    rpcUrl: 'https://mainnet.base.org',
    explorer: 'https://basescan.org',
  },
  eth: {
    key: 'eth',
    label: 'Ethereum',
    chainId: 1,
    chainIdHex: '0x1',
    rpcUrl: 'https://ethereum-rpc.publicnode.com',
    explorer: 'https://etherscan.io',
  },
} as const;

const TOKEN_CONFIGS = {
  base: {
    usdc: { key: 'usdc', symbol: 'USDC', address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6 },
    usdt: { key: 'usdt', symbol: 'USDT', address: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2', decimals: 6 },
  },
  eth: {
    usdc: { key: 'usdc', symbol: 'USDC', address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6 },
    usdt: { key: 'usdt', symbol: 'USDT', address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6 },
  },
} as const;

type LastTx = {
  hash: string;
  memo?: string;
  status?: 'submitted' | 'confirmed';
} | null;

type PaymentRecord = {
  ts: number;
  txHash: string;
  to: string;
  amount: string;
  memo?: string;
  invoiceId?: string;
};

type InvoiceTemplate = {
  name: string;
  to: string;
  amount: string;
  memo?: string;
  invoiceId?: string;
  expMin?: number;
  flexAmount?: boolean;
  compactMode?: boolean;
};

type InvoiceRecord = {
  ts: number;
  url: string;
  to: string;
  amount: string;
  memo?: string;
  invoiceId?: string;
  expTs?: number | null;
};

type PaymentSummary = {
  ts: number;
  txHash: string;
  to: string;
  amount: string;
  memo?: string;
  invoiceId?: string;
};

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
  let s = (str || '').trim();
  if (!s) return null;

  // Normalize common locale/IME inputs (full-width digits, full-width dot/comma).
  s = s
    .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/，/g, ',')
    .replace(/．/g, '.')
    .replace(/。/g, '.')
    .replace(/,/g, '');

  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const [i, f = ''] = s.split('.');
  if (f.length > 6) return null;
  const frac = (f + '000000').slice(0, 6);
  return BigInt(i) * 1000000n + BigInt(frac);
}

function buildShareUrl(chainKey: string, tokenKey: string, to: string, amount: string, memo: string, invoiceId?: string): string {
  const u = new URL(location.href);
  u.searchParams.delete('d');
  u.searchParams.set('chain', chainKey);
  u.searchParams.set('token', tokenKey);
  u.searchParams.set('to', to);
  u.searchParams.set('amount', amount);
  if (memo) u.searchParams.set('memo', memo);
  else u.searchParams.delete('memo');
  if (invoiceId) u.searchParams.set('invoiceId', invoiceId);
  else u.searchParams.delete('invoiceId');
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
        <div id="tagLine" class="tag">Base USDC invoice link</div>
        <div class="btns" style="margin-left:auto;margin-top:0">
          <select id="chainSel" style="background:#0f1320;color:var(--fg);border:1px solid #273142;border-radius:10px;padding:8px 10px">
            <option value="base">Base</option>
            <option value="eth">Ethereum</option>
          </select>
          <select id="tokenSel" style="background:#0f1320;color:var(--fg);border:1px solid #273142;border-radius:10px;padding:8px 10px">
            <option value="usdc">USDC</option>
            <option value="usdt">USDT</option>
          </select>
          <button id="langJa" type="button">日本語</button>
          <button id="langEn" type="button">English</button>
        </div>
        <div id="netPill" class="pill">Wallet: not connected</div>
      </div>

      <div class="card">
        <div class="btns" style="margin-top:0">
          <button id="tabPay" type="button" class="primary">支払い</button>
          <button id="tabCreate" type="button">請求作成</button>
        </div>
        <div id="tabHint" class="small" style="margin-top:8px">支払い / 請求作成 を切り替えできます。</div>
      </div>

      <div id="toast" class="pill" style="display:none; position:fixed; left:50%; bottom:16px; transform:translateX(-50%); z-index:9999; justify-content:center; background:#0f1320; max-width:90%; text-align:center"></div>

      <div id="panelPay" class="card">
        <div class="row">
          <div class="col">
            <label id="lblTo">支払い先 (to)</label>
            <input id="to" class="mono" placeholder="0x..." />
            <div class="btns" style="margin-top:8px">
              <button id="useMyAddress" type="button">自分の接続アドレスを使う</button>
            </div>
          </div>
          <div class="col">
            <label id="lblAmount">金額 (USDC)</label>
            <input id="amount" class="mono" placeholder="10" inputmode="decimal" />
          </div>
        </div>
        <div class="row" style="margin-top:10px">
          <div class="col" style="min-width:100%">
            <label id="lblMemo">メモ (任意)</label>
            <input id="memo" placeholder="task-123" />
          </div>
        </div>
        <div class="row" style="margin-top:10px">
          <div class="col" style="min-width:100%">
            <label id="lblInvoiceId">請求ID (invoiceId, 任意)</label>
            <input id="invoiceId" placeholder="inv-20260219-001" />
          </div>
        </div>
        <div id="chainWarn" class="warn" style="margin-top:6px;display:none"></div>
        <div id="tokenWarn" class="warn" style="margin-top:6px;display:none"></div>
        <div id="sigWarn" class="warn" style="margin-top:6px;display:none"></div>
        <div id="issuerBadge" class="small" style="margin-top:6px;display:none"></div>
        <div id="toChecksum" class="small" style="margin-top:4px"></div>

        <div class="btns">
          <button id="connect" class="primary">ウォレット接続</button>
          <a id="openInCbw" class="btn" target="_blank" rel="noreferrer">Coinbase Walletで開く</a>
          <button id="disconnect">切断</button>
          <button id="pay" class="ok" disabled>支払う（USDC送金）</button>
          <button id="copy" class="primary">コピー（宛先/金額/メモ）</button>
          <button id="exportCsv">CSV出力</button>
          <a id="basescan" class="btn" target="_blank" rel="noreferrer">BaseScanで見る</a>
        </div>
        <div class="row" style="margin-top:8px">
          <div class="col" style="min-width:170px">
            <label id="lblCsvFrom">CSV開始日</label>
            <input id="csvFrom" type="date" />
          </div>
          <div class="col" style="min-width:170px">
            <label id="lblCsvTo">CSV終了日</label>
            <input id="csvTo" type="date" />
          </div>
          <div class="col" style="min-width:220px">
            <label id="lblCsvSort">CSV並び順</label>
            <select id="csvSort" style="width:100%;box-sizing:border-box;background:#0f1320;color:var(--fg);border:1px solid #273142;border-radius:10px;padding:10px 12px;font-size:14px">
              <option value="invoiceIdAsc">invoiceId (A→Z)</option>
              <option value="invoiceIdDesc">invoiceId (Z→A)</option>
              <option value="timeDesc">time (new→old)</option>
              <option value="timeAsc">time (old→new)</option>
            </select>
          </div>
        </div>

        <div id="msg" class="muted" style="margin-top:10px">JS loaded. Ready.</div>
        <div id="diag" class="small" style="margin-top:6px"></div>
        <div id="tx" class="muted" style="margin-top:6px"></div>
        <div id="lastPayCard" class="small" style="margin-top:8px"></div>
        <div id="bal" class="muted" style="margin-top:6px"></div>
        <div id="err" class="warn" style="margin-top:10px;display:none"></div>
        <div id="ok" class="good" style="margin-top:10px;display:none"></div>
        <div id="payChecks" class="small" style="margin-top:8px"></div>
        <div id="expState" class="small" style="margin-top:8px"></div>

        <div class="sep"></div>
        <div id="verifyTitle" class="muted" style="margin-bottom:8px">支払い確認（Txハッシュ照合: 宛先/金額の一致判定つき）</div>
        <div class="row">
          <input id="verifyTx" class="mono" placeholder="0x...（66文字）" />
          <button id="verifyBtn">確認する</button>
          <button id="copyVerify">検証結果コピー</button>
        </div>
        <div id="verifyResult" class="small" style="margin-top:8px"></div>

        <div class="sep"></div>
        <div class="muted">
          <span id="footer1">このページは Base 上の USDC 支払い用です（資金を預かりません）。</span>
          <span id="footer2">送金は不可逆なので、宛先と金額を確認してから実行してください。</span>
        </div>
        <div id="usdcContractLine" class="small" style="margin-top:10px"></div>
      </div>

      <div id="panelCreate" class="card" style="display:none">
        <div id="createTitle" class="muted" style="margin-bottom:8px">請求作成（Invoice Creator）</div>
        <div class="row">
          <div class="col">
            <label id="lblInvTo">to</label>
            <input id="invTo" class="mono" placeholder="0x..." />
          </div>
          <div class="col">
            <label id="lblInvAmount">amount (USDC)</label>
            <input id="invAmount" class="mono" placeholder="10" inputmode="decimal" />
          </div>
        </div>
        <div class="row" style="margin-top:10px">
          <div class="col" style="min-width:100%">
            <label id="lblInvMemo">memo (optional)</label>
            <input id="invMemo" placeholder="task-123" />
          </div>
        </div>
        <div class="row" style="margin-top:10px">
          <div class="col" style="min-width:100%">
            <label id="lblInvInvoiceId">invoiceId (optional)</label>
            <input id="invInvoiceId" placeholder="inv-20260219-001" />
          </div>
        </div>

        <div class="row" style="margin-top:10px">
          <div class="col">
            <label id="lblExp">有効期限（分, 0で無期限）</label>
            <input id="invExpMin" class="mono" placeholder="1440" inputmode="numeric" />
          </div>
        </div>

        <div class="row" style="margin-top:10px">
          <div class="col">
            <label id="lblFlex">支払い側で金額を編集</label>
            <div class="btns" style="margin-top:0">
              <button id="amtFlex" type="button">OFF（固定）</button>
            </div>
            <div id="flexHint" class="small">ONで金額のみ編集可（宛先/メモは固定）。</div>
          </div>
        </div>

        <div class="btns">
          <button id="gen" class="primary">請求リンク生成</button>
          <button id="signInvoice">請求内容に署名</button>
          <button id="compact">短縮URL: ON</button>
          <button id="lock">ロック: OFF</button>
          <button id="apply">この請求をフォームに反映</button>
        </div>
        <div id="signState" class="small" style="margin-top:6px"></div>
        <div class="row" style="margin-top:8px">
          <div class="col" style="min-width:220px">
            <label id="lblTplName">テンプレ名</label>
            <input id="tplName" placeholder="client-a-monthly" />
          </div>
          <div class="col" style="min-width:220px">
            <label id="lblTplSelect">保存済みテンプレ</label>
            <select id="tplSelect" style="width:100%;box-sizing:border-box;background:#0f1320;color:var(--fg);border:1px solid #273142;border-radius:10px;padding:10px 12px;font-size:14px"></select>
          </div>
        </div>
        <div class="btns" style="margin-top:8px">
          <button id="tplSave">テンプレ保存</button>
          <button id="tplLoad">テンプレ読込</button>
          <button id="tplDelete">テンプレ削除</button>
        </div>
        <div class="small" id="modeHint" style="margin-top:8px">モード: 固定金額（amount編集不可）</div>
        <div id="invoiceGeneratedLabel" class="muted" style="margin-top:10px">生成された請求リンク</div>
        <div class="row">
          <input id="invoiceUrl" class="mono" readonly />
          <button id="copyInvoice">URLコピー</button>
          <button id="shareInvoice">共有</button>
          <a id="openInvoice" class="btn" target="_blank" rel="noreferrer">開く</a>
        </div>
        <div id="lockHint" class="small" style="margin-top:8px">ロック中は支払いフォームを編集不可にして誤送金を防ぎます（任意金額ONならamountだけ編集可）。</div>

        <div class="sep"></div>
        <div id="recentInvoicesTitle" class="muted" style="margin-bottom:8px">最近の請求履歴</div>
        <div id="recentInvoices" class="small"></div>
      </div>

      <div class="card">
        <div id="pageUrlTitle" class="muted" style="margin-bottom:8px">ページURL（このページのトップ）</div>
        <div class="row">
          <input id="pageUrl" class="mono" readonly />
          <button id="copyPage">URLコピー</button>
        </div>
        <div id="pageUrlHint" class="small" style="margin-top:8px">パラメータ無しのURL。案内・ブックマーク用。</div>
      </div>

      <div class="card">
        <div id="shareUrlTitle" class="muted" style="margin-bottom:8px">共有用リンク（現在のURL / パラメータ付き）</div>
        <div class="row">
          <input id="share" class="mono" readonly />
          <button id="copyShare">URLコピー</button>
        </div>
        <div id="shareUrlHint" class="small" style="margin-top:8px">請求作成で生成した「請求リンク」は上の生成欄（invoiceUrl）を使うのが推奨。</div>
      </div>
    </div>
  `)
  );

  const $ = (id: string) => document.getElementById(id) as HTMLElement | null;

  const chainSelEl = $('chainSel') as HTMLSelectElement;
  const tokenSelEl = $('tokenSel') as HTMLSelectElement;
  const langJaBtn = $('langJa') as HTMLButtonElement;
  const langEnBtn = $('langEn') as HTMLButtonElement;
  const tagLineEl = $('tagLine')!;
  const tabPayBtn = $('tabPay') as HTMLButtonElement;
  const tabCreateBtn = $('tabCreate') as HTMLButtonElement;
  const tabHintEl = $('tabHint')!;
  const toastEl = $('toast')!;
  const panelPay = $('panelPay')!;
  const panelCreate = $('panelCreate')!;

  const toEl = $('to') as HTMLInputElement;
  const useMyAddressBtn = $('useMyAddress') as HTMLButtonElement;
  const amountEl = $('amount') as HTMLInputElement;
  const memoEl = $('memo') as HTMLInputElement;
  const invoiceIdEl = $('invoiceId') as HTMLInputElement;
  const chainWarnEl = $('chainWarn')!;
  const tokenWarnEl = $('tokenWarn')!;
  const sigWarnEl = $('sigWarn')!;
  const issuerBadgeEl = $('issuerBadge')!;
  const toChecksumEl = $('toChecksum')!;
  const msgEl = $('msg')!;
  const diagEl = $('diag')!;
  const usdcContractLineEl = $('usdcContractLine')!;
  const txEl = $('tx')!;
  const lastPayCardEl = $('lastPayCard')!;
  const balEl = $('bal')!;
  const errEl = $('err')!;
  const okEl = $('ok')!;
  const payChecksEl = $('payChecks')!;
  const expStateEl = $('expState')!;
  const verifyTxEl = $('verifyTx') as HTMLInputElement;
  const verifyBtn = $('verifyBtn') as HTMLButtonElement;
  const copyVerifyBtn = $('copyVerify') as HTMLButtonElement;
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
  const invInvoiceIdEl = $('invInvoiceId') as HTMLInputElement;
  const invExpMinEl = $('invExpMin') as HTMLInputElement;
  const invoiceUrlEl = $('invoiceUrl') as HTMLInputElement;
  const recentInvoicesTitleEl = $('recentInvoicesTitle')!;
  const recentInvoicesEl = $('recentInvoices')!;
  const genBtn = $('gen') as HTMLButtonElement;
  const signInvoiceBtn = $('signInvoice') as HTMLButtonElement;
  const signStateEl = $('signState')!;
  const compactBtn = $('compact') as HTMLButtonElement;
  const lockBtn = $('lock') as HTMLButtonElement;
  const applyBtn = $('apply') as HTMLButtonElement;
  const tplNameEl = $('tplName') as HTMLInputElement;
  const tplSelectEl = $('tplSelect') as HTMLSelectElement;
  const tplSaveBtn = $('tplSave') as HTMLButtonElement;
  const tplLoadBtn = $('tplLoad') as HTMLButtonElement;
  const tplDeleteBtn = $('tplDelete') as HTMLButtonElement;
  const copyInvoiceBtn = $('copyInvoice') as HTMLButtonElement;
  const shareInvoiceBtn = $('shareInvoice') as HTMLButtonElement;
  const openInvoiceEl = $('openInvoice') as HTMLAnchorElement;
  const modeHintEl = $('modeHint')!;
  const amtFlexBtn = $('amtFlex') as HTMLButtonElement;

  const connectBtn = $('connect') as HTMLButtonElement;
  const disconnectBtn = $('disconnect') as HTMLButtonElement;
  const copyBtn = $('copy') as HTMLButtonElement;
  const exportCsvBtn = $('exportCsv') as HTMLButtonElement;
  const csvFromEl = $('csvFrom') as HTMLInputElement;
  const csvToEl = $('csvTo') as HTMLInputElement;
  const csvSortEl = $('csvSort') as HTMLSelectElement;
  const copyPageBtn = $('copyPage') as HTMLButtonElement;
  const copyShareBtn = $('copyShare') as HTMLButtonElement;

  type Tab = 'pay' | 'create';
  type Lang = 'ja' | 'en';
  let activeTab: Tab = 'pay';
  let lang: Lang = 'ja';
  let currentChain: keyof typeof CHAIN_CONFIGS = 'base';
  let currentTokenKey: 'usdc' | 'usdt' = 'usdc';
  let invoiceContextChain: keyof typeof CHAIN_CONFIGS | null = null;
  let invoiceContextToken: 'usdc' | 'usdt' | null = null;
  let hasInvoiceContext = false;
  let invoiceSigMismatch = false;
  let signedByIssuer: string | null = null;
  let signedProof: string | null = null;
  let payPanelInitialized = false;
  let createPanelInitialized = false;

  const i18n = {
    ja: {
      walletNotConnected: 'Wallet: 未接続',
      walletConnected: 'Wallet',
      tabPay: '支払い',
      tabCreate: '請求作成',
      tabHint: '支払い / 請求作成 を切り替えできます。',
      lblTo: '支払い先 (to)', lblAmount: '金額 (USDC)', lblMemo: 'メモ (任意)', lblInvoiceId: '請求ID (invoiceId, 任意)', useMyAddress: '自分の接続アドレスを使う',
      connect: 'ウォレット接続', openCbw: 'Coinbase Walletで開く', disconnect: '切断', pay: '支払う（USDC送金）', copy: 'コピー（宛先/金額/メモ）',
      verifyTitle: '支払い確認（Txハッシュ照合: 宛先/金額の一致判定つき）', verifyBtn: '確認する', verifyCopy: '検証結果コピー',
      createTitle: '請求作成（Invoice Creator）', lblInvMemo: 'memo (optional)', lblInvInvoiceId: 'invoiceId (optional)', lblExp: '有効期限（分, 0で無期限）',
      lblFlex: '支払い側で金額を編集', flexHint: 'ONで金額のみ編集可（宛先/メモは固定）。',
      gen: '請求リンク生成', signInvoice: '請求内容に署名', apply: 'この請求をフォームに反映', copyUrl: 'URLコピー', share: '共有', open: '開く', exportCsv: 'CSV出力',
      pageUrlTitle: 'ページURL（このページのトップ）', pageUrlHint: 'パラメータ無しのURL。案内・ブックマーク用。',
      shareUrlTitle: '共有用リンク（現在のURL / パラメータ付き）', shareUrlHint: '請求作成で生成した「請求リンク」は上の生成欄（invoiceUrl）を使うのが推奨。',
      modeFixed: 'モード: 固定金額（amount編集不可）', modeFlex: 'モード: 任意金額（amount編集可 / to,memo固定）',
      expNoLimit: '有効期限: 無期限',
      baseScan: 'BaseScanで見る',
      usdcBalance: 'USDC残高',
      unconnected: '未接続',
      errInvalidTo: '宛先アドレス(to)が正しくありません。',
      errInvalidAmount: '金額(USDC)が正しくありません（小数は6桁まで）。',
      errInsufficient: 'USDC残高が不足しています。',
      errExpired: 'この請求リンクは有効期限切れです。新しい請求リンクを発行してください。',
      footer1: 'このページは Base 上の USDC 支払い用です（資金を預かりません）。',
      footer2: '送金は不可逆なので、宛先と金額を確認してから実行してください。',
      verifyPlaceholder: '0x...（66文字）',
      lblCsvFrom: 'CSV開始日',
      lblCsvTo: 'CSV終了日',
      lblCsvSort: 'CSV並び順',
      sortInvoiceIdAsc: 'invoiceId (昇順)',
      sortInvoiceIdDesc: 'invoiceId (降順)',
      sortTimeDesc: '日時 (新しい順)',
      sortTimeAsc: '日時 (古い順)',
      lockOn: 'ロック: ON',
      lockOff: 'ロック: OFF',
      compactOn: '短縮URL: ON',
      compactOff: '短縮URL: OFF',
      flexOn: 'ON（任意金額）',
      flexOff: 'OFF（固定）',
      lockHint: 'ロック中は支払いフォームを編集不可にして誤送金を防ぎます（任意金額ONならamountだけ編集可）。',
      checkTitle: '支払い条件',
      checkTo: '宛先アドレス',
      checkAmount: '金額形式',
      checkBalance: 'USDC残高',
      checkExpiry: '有効期限内',
      lblTplName: 'テンプレ名',
      lblTplSelect: '保存済みテンプレ',
      tplSave: 'テンプレ保存',
      tplLoad: 'テンプレ読込',
      tplDelete: 'テンプレ削除',
      tplNone: '(テンプレなし)',
      recentInvoicesTitle: '最近の請求履歴',
      noRecentInvoices: 'まだ請求履歴がありません。',
      useThis: 'この内容を反映',
      copyLink: 'リンクコピー',
      paySummaryTitle: '直近の支払いサマリー',
      paySummaryCopy: 'サマリーをコピー',
      noPaySummary: 'まだ支払いサマリーがありません。',
      chainMismatchWarn: 'この請求リンクは {chain} 向けです。現在は {current} が選択されています。',
      tokenMismatchWarn: 'この請求リンクは {token} 向けです。現在は {current} が選択されています。',
      sigMismatchWarn: '請求リンクの改ざんを検知しました（署名不一致）。',
      issuerVerified: '発行者署名: 検証済み',
      diagTitle: '起動診断',
      diagWallet: 'ウォレットAPI',
      diagRpc: 'Base RPC',
      diagChain: '接続チェーン',
    },
    en: {
      walletNotConnected: 'Wallet: not connected',
      walletConnected: 'Wallet',
      tabPay: 'Pay',
      tabCreate: 'Create Invoice',
      tabHint: 'Switch between Pay and Invoice Creator.',
      lblTo: 'Recipient (to)', lblAmount: 'Amount (USDC)', lblMemo: 'Memo (optional)', lblInvoiceId: 'Invoice ID (optional)', useMyAddress: 'Use my connected wallet address',
      connect: 'Connect Wallet', openCbw: 'Open in Coinbase Wallet', disconnect: 'Disconnect', pay: 'Pay (USDC transfer)', copy: 'Copy (to/amount/memo)',
      verifyTitle: 'Payment verification (Tx hash with recipient/amount match)', verifyBtn: 'Verify', verifyCopy: 'Copy verification',
      createTitle: 'Invoice Creator', lblInvMemo: 'memo (optional)', lblInvInvoiceId: 'invoiceId (optional)', lblExp: 'Expiry (minutes, 0 = no expiry)',
      lblFlex: 'Allow payer to edit amount', flexHint: 'When ON, only amount is editable (to/memo locked).',
      gen: 'Generate Invoice Link', signInvoice: 'Sign invoice payload', apply: 'Apply this invoice to form', copyUrl: 'Copy URL', share: 'Share', open: 'Open', exportCsv: 'Export CSV',
      pageUrlTitle: 'Page URL (top page)', pageUrlHint: 'URL without parameters. For guide/bookmark.',
      shareUrlTitle: 'Share URL (current URL with parameters)', shareUrlHint: 'For payment requests, prefer generated invoice URL above.',
      modeFixed: 'Mode: fixed amount (amount locked)', modeFlex: 'Mode: flexible amount (amount editable / to,memo locked)',
      expNoLimit: 'Expiry: none',
      baseScan: 'View on BaseScan',
      usdcBalance: 'USDC balance',
      unconnected: 'not connected',
      errInvalidTo: 'Recipient address (to) is invalid.',
      errInvalidAmount: 'Amount (USDC) is invalid (up to 6 decimals).',
      errInsufficient: 'Insufficient USDC balance.',
      errExpired: 'This invoice link has expired. Please issue a new one.',
      footer1: 'This page is for USDC payments on Base (non-custodial).',
      footer2: 'Transfers are irreversible. Please verify recipient and amount before sending.',
      verifyPlaceholder: '0x... (66 chars)',
      lblCsvFrom: 'CSV from date',
      lblCsvTo: 'CSV to date',
      lblCsvSort: 'CSV sort',
      sortInvoiceIdAsc: 'invoiceId (A→Z)',
      sortInvoiceIdDesc: 'invoiceId (Z→A)',
      sortTimeDesc: 'time (new→old)',
      sortTimeAsc: 'time (old→new)',
      lockOn: 'Lock: ON',
      lockOff: 'Lock: OFF',
      compactOn: 'Short URL: ON',
      compactOff: 'Short URL: OFF',
      flexOn: 'ON (flexible)',
      flexOff: 'OFF (fixed)',
      lockHint: 'Lock mode prevents editing payment form fields to reduce mistakes (if flexible amount is ON, only amount is editable).',
      checkTitle: 'Payment readiness',
      checkTo: 'Recipient address',
      checkAmount: 'Amount format',
      checkBalance: 'USDC balance',
      checkExpiry: 'Not expired',
      lblTplName: 'Template name',
      lblTplSelect: 'Saved templates',
      tplSave: 'Save template',
      tplLoad: 'Load template',
      tplDelete: 'Delete template',
      tplNone: '(no templates)',
      recentInvoicesTitle: 'Recent invoice history',
      noRecentInvoices: 'No invoice history yet.',
      useThis: 'Apply this',
      copyLink: 'Copy link',
      paySummaryTitle: 'Latest payment summary',
      paySummaryCopy: 'Copy summary',
      noPaySummary: 'No payment summary yet.',
      chainMismatchWarn: 'This invoice link is for {chain}. Current selection is {current}.',
      tokenMismatchWarn: 'This invoice link is for {token}. Current selection is {current}.',
      sigMismatchWarn: 'Invoice link appears tampered (signature mismatch).',
      issuerVerified: 'Issuer signature: verified',
      diagTitle: 'Startup diagnostics',
      diagWallet: 'Wallet API',
      diagRpc: 'Base RPC',
      diagChain: 'Connected chain',
    }
  } as const;

  function tr<K extends keyof typeof i18n.ja>(k: K): string {
    return i18n[lang][k] || i18n.ja[k];
  }

  function chainCfg() {
    return CHAIN_CONFIGS[currentChain];
  }

  function tokenCfg() {
    return TOKEN_CONFIGS[currentChain][currentTokenKey];
  }

  function ensurePayPanelInitialized() {
    if (payPanelInitialized) return;
    renderLastPaymentSummary();
    payPanelInitialized = true;
  }

  function ensureCreatePanelInitialized() {
    if (createPanelInitialized) return;
    refreshTemplateSelect();
    renderRecentInvoices();
    createPanelInitialized = true;
  }

  function applyI18n() {
    tagLineEl.textContent = `${chainCfg().label} ${tokenCfg().symbol} invoice link`;
    tabPayBtn.textContent = tr('tabPay');
    tabCreateBtn.textContent = tr('tabCreate');
    tabHintEl.textContent = tr('tabHint');

    const textMap: Record<string, string> = {
      lblTo: tr('lblTo'), lblAmount: tr('lblAmount'), lblMemo: tr('lblMemo'), lblInvoiceId: tr('lblInvoiceId'),
      verifyTitle: tr('verifyTitle'), createTitle: tr('createTitle'), lblInvMemo: tr('lblInvMemo'), lblInvInvoiceId: tr('lblInvInvoiceId'),
      lblExp: tr('lblExp'), lblFlex: tr('lblFlex'), flexHint: tr('flexHint'),
      invoiceGeneratedLabel: lang === 'ja' ? '生成された請求リンク' : 'Generated invoice link',
      pageUrlTitle: tr('pageUrlTitle'), pageUrlHint: tr('pageUrlHint'), shareUrlTitle: tr('shareUrlTitle'), shareUrlHint: tr('shareUrlHint'),
      footer1: tr('footer1'), footer2: tr('footer2'),
      lblCsvFrom: tr('lblCsvFrom'), lblCsvTo: tr('lblCsvTo'), lblCsvSort: tr('lblCsvSort'), lockHint: tr('lockHint'),
      lblTplName: tr('lblTplName'), lblTplSelect: tr('lblTplSelect'), recentInvoicesTitle: tr('recentInvoicesTitle'),
    };
    Object.entries(textMap).forEach(([id, text]) => {
      const n = document.getElementById(id);
      if (n) n.textContent = text;
    });

    connectBtn.textContent = tr('connect');
    openInCbw.textContent = tr('openCbw');
    disconnectBtn.textContent = tr('disconnect');
    basescanEl.textContent = tr('baseScan');
    payBtn.textContent = tr('pay');
    copyBtn.textContent = tr('copy');
    exportCsvBtn.textContent = tr('exportCsv');
    verifyBtn.textContent = tr('verifyBtn');
    copyVerifyBtn.textContent = tr('verifyCopy');
    genBtn.textContent = tr('gen');
    signInvoiceBtn.textContent = tr('signInvoice');
    applyBtn.textContent = tr('apply');
    tplSaveBtn.textContent = tr('tplSave');
    tplLoadBtn.textContent = tr('tplLoad');
    tplDeleteBtn.textContent = tr('tplDelete');
    copyInvoiceBtn.textContent = tr('copyUrl');
    shareInvoiceBtn.textContent = tr('share');
    copyPageBtn.textContent = tr('copyUrl');
    copyShareBtn.textContent = tr('copyUrl');
    openInvoiceEl.textContent = tr('open');
    useMyAddressBtn.textContent = tr('useMyAddress');
    verifyTxEl.placeholder = tr('verifyPlaceholder');

    const opts = csvSortEl.options;
    if (opts.length >= 4) {
      opts[0].text = tr('sortInvoiceIdAsc');
      opts[1].text = tr('sortInvoiceIdDesc');
      opts[2].text = tr('sortTimeDesc');
      opts[3].text = tr('sortTimeAsc');
    }

    if (createPanelInitialized) {
      const sel = tplSelectEl.value;
      refreshTemplateSelect(sel);
      if (sel) tplSelectEl.value = sel;
      renderRecentInvoices();
    }
    if (payPanelInitialized) renderLastPaymentSummary();

    usdcContractLineEl.innerHTML = `${tokenCfg().symbol} contract (${chainCfg().label}): <span class="mono">${tokenCfg().address}</span>`;
    chainSelEl.value = currentChain;
    tokenSelEl.value = currentTokenKey;
    refreshSignState();

    langJaBtn.classList.toggle('primary', lang === 'ja');
    langEnBtn.classList.toggle('primary', lang === 'en');
  }

  function setTab(tab: Tab) {
    activeTab = tab;
    const payOn = tab === 'pay';
    panelPay.style.display = payOn ? 'block' : 'none';
    panelCreate.style.display = payOn ? 'none' : 'block';
    tabPayBtn.classList.toggle('primary', payOn);
    tabCreateBtn.classList.toggle('primary', !payOn);

    if (payOn) ensurePayPanelInitialized();
    else ensureCreatePanelInitialized();

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

  async function runStartupDiagnostics() {
    const walletOk = !!window.ethereum?.request;

    let rpcOk = false;
    try {
      const r = await fetch(chainCfg().rpcUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }),
      });
      const j = await r.json();
      rpcOk = !!j?.result;
    } catch {
      rpcOk = false;
    }

    let chainText = lang === 'ja' ? '未接続' : 'not connected';
    try {
      const cid = await window.ethereum?.request?.({ method: 'eth_chainId' });
      if (cid) chainText = cid === chainCfg().chainIdHex ? `${chainCfg().label} (${cid})` : `${cid}`;
    } catch {}

    diagEl.textContent = `${tr('diagTitle')}: ${walletOk ? '✅' : '❌'} ${tr('diagWallet')} / ${rpcOk ? '✅' : '❌'} ${tr('diagRpc')} / ${tr('diagChain')}: ${chainText}`;
  }

  let wcProvider: any = null;
  let browserProvider: ethers.BrowserProvider | null = null;
  let signer: ethers.Signer | null = null;
  let connectedAddress: string | null = null;

  let usdcBalanceUnits: bigint = 0n;
  let lastChainId: string | null = null;
  let lastBalErr: string | null = null;
  let lastVerifyText = '';

  function setPill() {
    netPill.textContent = connectedAddress
      ? `${tr('walletConnected')}: ${connectedAddress.slice(0, 6)}…${connectedAddress.slice(-4)}`
      : tr('walletNotConnected');
  }

  async function ensureChainInjected() {
    const eth = window.ethereum;
    if (!eth?.request) return;
    const cfg = chainCfg();
    const chainId = await eth.request({ method: 'eth_chainId' });
    if (chainId === cfg.chainIdHex) return;
    try {
      await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: cfg.chainIdHex }] });
    } catch (e: any) {
      if (e?.code === 4902) {
        await eth.request({
          method: 'wallet_addEthereumChain',
          params: [
            {
              chainId: cfg.chainIdHex,
              chainName: cfg.label,
              nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
              rpcUrls: [cfg.rpcUrl],
              blockExplorerUrls: [cfg.explorer],
            },
          ],
        });
      } else {
        throw e;
      }
    }
  }

  async function ensureChainWc() {
    const cfg = chainCfg();
    const chainId = await wcProvider.request({ method: 'eth_chainId' });
    if (chainId === cfg.chainIdHex) return;
    try {
      await wcProvider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: cfg.chainIdHex }] });
    } catch (e: any) {
      if (e?.code === 4902) {
        await wcProvider.request({
          method: 'wallet_addEthereumChain',
          params: [
            {
              chainId: cfg.chainIdHex,
              chainName: cfg.label,
              nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
              rpcUrls: [cfg.rpcUrl],
              blockExplorerUrls: [cfg.explorer],
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
      if (wcProvider) await ensureChainWc();
      else await ensureChainInjected();

      try {
        if (wcProvider) lastChainId = await wcProvider.request({ method: 'eth_chainId' });
        else lastChainId = await window.ethereum?.request?.({ method: 'eth_chainId' });
      } catch {
        lastChainId = null;
      }

      const usdc = new ethers.Contract(tokenCfg().address, ERC20_ABI, browserProvider);
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
  let compactMode = true;
  let invoiceExpTs: number | null = null;

  function invoiceCanonical(payload: { chain: string; token: string; to: string; amount: string; memo?: string; invoiceId?: string; exp?: number; lock?: number; flex?: number; }) {
    return JSON.stringify({
      c: payload.chain,
      tk: payload.token,
      t: (payload.to || '').toLowerCase(),
      a: String(payload.amount || ''),
      m: payload.memo || '',
      i: payload.invoiceId || '',
      e: Number(payload.exp || 0),
      l: Number(payload.lock || 0),
      f: Number(payload.flex || 0),
    });
  }

  function makeInvoiceSig(payload: { chain: string; token: string; to: string; amount: string; memo?: string; invoiceId?: string; exp?: number; lock?: number; flex?: number; }) {
    return ethers.keccak256(ethers.toUtf8Bytes(invoiceCanonical(payload)));
  }

  function invoiceSignMessage(payload: { chain: string; token: string; to: string; amount: string; memo?: string; invoiceId?: string; exp?: number; lock?: number; flex?: number; }) {
    return `AgentPay Invoice\n${invoiceCanonical(payload)}`;
  }

  function encodeCompact(payload: object): string {
    const raw = JSON.stringify(payload);
    return btoa(unescape(encodeURIComponent(raw))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  function decodeCompact(s: string): any | null {
    try {
      const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
      const raw = decodeURIComponent(escape(atob(b64)));
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function loadPaymentHistory(): PaymentRecord[] {
    try {
      const v = localStorage.getItem('agentpay_payments');
      const arr = v ? JSON.parse(v) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  function savePaymentHistory(rec: PaymentRecord) {
    const arr = loadPaymentHistory();
    arr.unshift(rec);
    localStorage.setItem('agentpay_payments', JSON.stringify(arr.slice(0, 500)));
  }

  function loadLastPaymentSummary(): PaymentSummary | null {
    try {
      const v = localStorage.getItem('agentpay_last_payment');
      if (!v) return null;
      const obj = JSON.parse(v);
      return obj && typeof obj === 'object' ? obj : null;
    } catch {
      return null;
    }
  }

  function saveLastPaymentSummary(rec: PaymentSummary) {
    localStorage.setItem('agentpay_last_payment', JSON.stringify(rec));
  }

  function renderLastPaymentSummary() {
    const s = loadLastPaymentSummary();
    if (!s) {
      lastPayCardEl.textContent = tr('noPaySummary');
      return;
    }
    const when = new Date(s.ts).toLocaleString();
    const memoLine = s.memo ? `<div>memo: <span class="mono">${s.memo}</span></div>` : '';
    const invLine = s.invoiceId ? `<div>invoiceId: <span class="mono">${s.invoiceId}</span></div>` : '';
    lastPayCardEl.innerHTML = `<div style="border:1px solid #273142;border-radius:10px;padding:8px">
      <div><b>${tr('paySummaryTitle')}</b></div>
      <div>time: <span class="mono">${when}</span></div>
      <div>tx: <span class="mono">${s.txHash.slice(0, 10)}…${s.txHash.slice(-8)}</span></div>
      <div>to: <span class="mono">${s.to}</span></div>
      <div>amount: <span class="mono">${s.amount}</span> ${tokenCfg().symbol}</div>
      ${memoLine}
      ${invLine}
      <div class="btns" style="margin-top:6px">
        <button id="copyPaySummary">${tr('paySummaryCopy')}</button>
        <a class="btn" target="_blank" rel="noreferrer" href="${chainCfg().explorer}/tx/${s.txHash}">Explorer</a>
      </div>
    </div>`;

    const btn = document.getElementById('copyPaySummary') as HTMLButtonElement | null;
    if (btn) {
      btn.onclick = async () => {
        const text = [
          `time: ${new Date(s.ts).toISOString()}`,
          `tx: ${s.txHash}`,
          `to: ${s.to}`,
          `amount: ${s.amount} ${tokenCfg().symbol}`,
          s.memo ? `memo: ${s.memo}` : '',
          s.invoiceId ? `invoiceId: ${s.invoiceId}` : '',
          `link: ${chainCfg().explorer}/tx/${s.txHash}`, 
        ].filter(Boolean).join('\n');
        try {
          await navigator.clipboard.writeText(text);
          toast(lang === 'ja' ? 'サマリーをコピーしました' : 'Copied summary');
        } catch {
          showErr(lang === 'ja' ? 'コピーに失敗しました。' : 'Failed to copy.');
        }
      };
    }
  }

  function loadInvoiceHistory(): InvoiceRecord[] {
    try {
      const v = localStorage.getItem('agentpay_invoices');
      const arr = v ? JSON.parse(v) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  function saveInvoiceHistory(rec: InvoiceRecord) {
    const arr = loadInvoiceHistory();
    arr.unshift(rec);
    localStorage.setItem('agentpay_invoices', JSON.stringify(arr.slice(0, 100)));
  }

  function renderRecentInvoices() {
    const list = loadInvoiceHistory();
    if (!list.length) {
      recentInvoicesEl.textContent = tr('noRecentInvoices');
      return;
    }
    recentInvoicesEl.innerHTML = list.slice(0, 6).map((r, idx) => {
      const expText = r.expTs ? (lang === 'ja' ? `有効期限: ${new Date(r.expTs * 1000).toLocaleString()}` : `Expiry: ${new Date(r.expTs * 1000).toLocaleString()}`) : (lang === 'ja' ? '無期限' : 'No expiry');
      const idText = r.invoiceId ? ` / invoiceId: <span class="mono">${r.invoiceId}</span>` : '';
      return `<div style="border:1px solid #273142;border-radius:10px;padding:8px;margin-bottom:8px">
        <div><span class="mono">${r.amount}</span> ${tokenCfg().symbol} / <span class="mono">${r.to.slice(0, 8)}…${r.to.slice(-6)}</span>${idText}</div>
        <div class="small">${expText}</div>
        <div class="btns" style="margin-top:6px">
          <button data-act="use" data-idx="${idx}">${tr('useThis')}</button>
          <button data-act="copy" data-idx="${idx}">${tr('copyLink')}</button>
        </div>
      </div>`;
    }).join('');

    recentInvoicesEl.querySelectorAll('button[data-act]').forEach((b) => {
      b.addEventListener('click', async (e) => {
        const elb = e.currentTarget as HTMLButtonElement;
        const idx = Number(elb.getAttribute('data-idx') || '-1');
        const act = elb.getAttribute('data-act');
        const rec = list[idx];
        if (!rec) return;
        if (act === 'use') {
          invToEl.value = rec.to;
          invAmountEl.value = rec.amount;
          invMemoEl.value = rec.memo || '';
          invInvoiceIdEl.value = rec.invoiceId || '';
          if (rec.expTs) {
            const rem = Math.max(0, Math.floor((rec.expTs - Math.floor(Date.now() / 1000)) / 60));
            invExpMinEl.value = String(rem);
          }
          invoiceUrlEl.value = rec.url;
          updateInvoiceButtons();
          toast(lang === 'ja' ? '請求内容を反映しました' : 'Applied invoice data');
        } else if (act === 'copy') {
          try {
            await navigator.clipboard.writeText(rec.url);
            toast(lang === 'ja' ? 'リンクをコピーしました' : 'Copied link');
          } catch {
            showErr(lang === 'ja' ? 'コピーに失敗しました。' : 'Failed to copy.');
          }
        }
      });
    });
  }

  function loadTemplates(): InvoiceTemplate[] {
    try {
      const v = localStorage.getItem('agentpay_templates');
      const arr = v ? JSON.parse(v) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  function saveTemplates(arr: InvoiceTemplate[]) {
    localStorage.setItem('agentpay_templates', JSON.stringify(arr.slice(0, 100)));
  }

  function refreshTemplateSelect(selected?: string) {
    const list = loadTemplates();
    tplSelectEl.innerHTML = '';
    if (!list.length) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.text = tr('tplNone');
      tplSelectEl.appendChild(opt);
      return;
    }
    list.forEach((t) => {
      const opt = document.createElement('option');
      opt.value = t.name;
      opt.text = t.name;
      tplSelectEl.appendChild(opt);
    });
    if (selected) tplSelectEl.value = selected;
  }

  function refreshSignState() {
    if (signedByIssuer) {
      signStateEl.textContent = lang === 'ja'
        ? `署名済み: ${signedByIssuer.slice(0, 6)}…${signedByIssuer.slice(-4)}`
        : `Signed by: ${signedByIssuer.slice(0, 6)}…${signedByIssuer.slice(-4)}`;
    } else {
      signStateEl.textContent = lang === 'ja' ? '未署名（任意）' : 'Unsigned (optional)';
    }
  }

  function clearSignedProof() {
    signedByIssuer = null;
    signedProof = null;
    refreshSignState();
  }

  function setLockUI() {
    lockBtn.textContent = invoiceLocked ? tr('lockOn') : tr('lockOff');
    // Lock payment form inputs; allow amount edit if flexAmount=true
    toEl.readOnly = invoiceLocked;
    amountEl.readOnly = invoiceLocked && !flexAmount;
    memoEl.readOnly = invoiceLocked;

    amtFlexBtn.textContent = flexAmount ? tr('flexOn') : tr('flexOff');
    compactBtn.textContent = compactMode ? tr('compactOn') : tr('compactOff');
    modeHintEl.textContent = flexAmount ? tr('modeFlex') : tr('modeFixed');
  }

  function buildInvoiceUrl(to: string, amount: string, memo: string, invoiceId: string, expTs?: number | null): string {
    const u = new URL(location.href);
    u.search = '';
    u.searchParams.set('tab', 'pay');
    u.searchParams.set('lang', lang);
    u.searchParams.set('chain', chainCfg().key);

    const sig = makeInvoiceSig({
      chain: chainCfg().key,
      token: currentTokenKey,
      to,
      amount,
      memo,
      invoiceId,
      exp: expTs ? Math.floor(expTs) : 0,
      lock: 1,
      flex: flexAmount ? 1 : 0,
    });

    if (compactMode) {
      const packed = encodeCompact({ tk: currentTokenKey, t: to, a: amount, m: memo || '', i: invoiceId || '', l: 1, f: flexAmount ? 1 : 0, e: expTs ? Math.floor(expTs) : 0 });
      u.searchParams.set('d', packed);
      u.searchParams.set('sig', sig);
      if (signedByIssuer && signedProof) {
        u.searchParams.set('issuer', signedByIssuer);
        u.searchParams.set('psig', signedProof);
      }
      return u.toString();
    }

    u.searchParams.set('lock', '1');
    if (flexAmount) u.searchParams.set('flexAmount', '1');
    else u.searchParams.delete('flexAmount');

    u.searchParams.set('token', currentTokenKey);
    u.searchParams.set('to', to);
    u.searchParams.set('amount', amount);
    if (memo) u.searchParams.set('memo', memo);
    else u.searchParams.delete('memo');
    if (invoiceId) u.searchParams.set('invoiceId', invoiceId);
    else u.searchParams.delete('invoiceId');

    if (expTs && Number.isFinite(expTs) && expTs > 0) u.searchParams.set('exp', String(Math.floor(expTs)));
    else u.searchParams.delete('exp');

    u.searchParams.set('sig', sig);
    if (signedByIssuer && signedProof) {
      u.searchParams.set('issuer', signedByIssuer);
      u.searchParams.set('psig', signedProof);
    }
    return u.toString();
  }

  function refresh() {
    const to = toEl.value.trim();
    const amount = amountEl.value.trim();
    const memo = memoEl.value.trim();
    const invoiceId = invoiceIdEl.value.trim();

    showErr('');

    basescanEl.href = isHexAddress(to) ? `${chainCfg().explorer}/address/${to}` : `${chainCfg().explorer}/`;
    if (isHexAddress(to)) {
      try {
        toChecksumEl.innerHTML = `checksum: <span class="mono">${ethers.getAddress(to)}</span>`;
      } catch {
        toChecksumEl.textContent = '';
      }
    } else {
      toChecksumEl.textContent = '';
    }

    const units = usdcToUnits(amount);
    const valid = isHexAddress(to) && units !== null;

    const chainMismatch = hasInvoiceContext && !!invoiceContextChain && invoiceContextChain !== currentChain;
    const tokenMismatch = hasInvoiceContext && !!invoiceContextToken && invoiceContextToken !== currentTokenKey;
    if (chainMismatch && invoiceContextChain) {
      const tpl = tr('chainMismatchWarn');
      const msg = tpl.replace('{chain}', CHAIN_CONFIGS[invoiceContextChain].label).replace('{current}', chainCfg().label);
      chainWarnEl.style.display = 'block';
      chainWarnEl.textContent = msg;
    } else {
      chainWarnEl.style.display = 'none';
      chainWarnEl.textContent = '';
    }

    if (tokenMismatch && invoiceContextToken) {
      const tpl = tr('tokenMismatchWarn');
      const msg = tpl.replace('{token}', invoiceContextToken.toUpperCase()).replace('{current}', currentTokenKey.toUpperCase());
      tokenWarnEl.style.display = 'block';
      tokenWarnEl.textContent = msg;
    } else {
      tokenWarnEl.style.display = 'none';
      tokenWarnEl.textContent = '';
    }

    if (invoiceSigMismatch) {
      sigWarnEl.style.display = 'block';
      sigWarnEl.textContent = tr('sigMismatchWarn');
      issuerBadgeEl.style.display = 'none';
      issuerBadgeEl.textContent = '';
    } else {
      sigWarnEl.style.display = 'none';
      sigWarnEl.textContent = '';
      if (signedByIssuer && signedProof) {
        issuerBadgeEl.style.display = 'block';
        issuerBadgeEl.innerHTML = `✅ ${tr('issuerVerified')} <span class="mono">${signedByIssuer.slice(0, 6)}…${signedByIssuer.slice(-4)}</span>`;
      } else {
        issuerBadgeEl.style.display = 'none';
        issuerBadgeEl.textContent = '';
      }
    }

    // Page URL (no params)
    pageUrlEl.value = `${location.origin}${location.pathname}`;

    shareEl.value = (isHexAddress(to) && amount) ? buildShareUrl(chainCfg().key, currentTokenKey, to, amount, memo, invoiceId) : location.href;

    const hasBalance = units !== null ? usdcBalanceUnits >= units : false;

    const now = Math.floor(Date.now() / 1000);
    const expired = invoiceExpTs !== null && now > invoiceExpTs;

    const checks = [
      { k: tr('checkTo'), ok: isHexAddress(to) },
      { k: tr('checkAmount'), ok: units !== null },
      { k: tr('checkBalance'), ok: !connectedAddress ? false : hasBalance },
      { k: tr('checkExpiry'), ok: !expired },
    ];
    payChecksEl.innerHTML = `${tr('checkTitle')}: ` + checks.map((c) => `${c.ok ? '✅' : '❌'} ${c.k}`).join(' / ');
    if (invoiceExpTs) {
      const remain = invoiceExpTs - now;
      if (remain > 0) {
        const min = Math.floor(remain / 60);
        expStateEl.textContent = lang === 'ja'
          ? `有効期限: ${new Date(invoiceExpTs * 1000).toLocaleString()}（残り約${min}分）`
          : `Expiry: ${new Date(invoiceExpTs * 1000).toLocaleString()} (~${min} min left)`;
      } else {
        expStateEl.innerHTML = lang === 'ja'
          ? `<span class="warn">この請求リンクは期限切れです（${new Date(invoiceExpTs * 1000).toLocaleString()}）。</span>`
          : `<span class="warn">This invoice link is expired (${new Date(invoiceExpTs * 1000).toLocaleString()}).</span>`;
      }
    } else {
      expStateEl.textContent = tr('expNoLimit');
    }

    payBtn.disabled = !(connectedAddress && valid && hasBalance && !expired && !chainMismatch && !tokenMismatch && !invoiceSigMismatch);

    // Tx UI
    if (!window.__agentpay_last_tx) {
      setTxHtml('');
    } else {
      const { hash, memo: m, status } = window.__agentpay_last_tx;
      const url = `${chainCfg().explorer}/tx/${hash}`;
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
      setBalHtml(`${tr('usdcBalance')}: (${tr('unconnected')})`);
    } else {
      const whole = (usdcBalanceUnits / 1000000n).toString();
      const frac = (usdcBalanceUnits % 1000000n)
        .toString()
        .padStart(6, '0')
        .replace(/0+$/, '');
      const balText = `${tr('usdcBalance')}: ${frac ? `${whole}.${frac}` : whole}`;
      const chainTxt = lastChainId ? `chainId: ${lastChainId}` : 'chainId: (unknown)';
      const errTxt = lastBalErr ? ` / balErr: ${lastBalErr}` : '';
      const addrScan = `${chainCfg().explorer}/address/${connectedAddress}`;
      const holdings = `${chainCfg().explorer}/tokenholdings?a=${connectedAddress}`;
      setBalHtml(
        `${balText} / ${chainTxt}${errTxt}<br/>BaseScan: <a class="btn" style="padding:4px 8px" target="_blank" rel="noreferrer" href="${addrScan}">address</a> <a class="btn" style="padding:4px 8px" target="_blank" rel="noreferrer" href="${holdings}">token holdings</a>`
      );
    }

    if (invoiceSigMismatch) showErr(tr('sigMismatchWarn'));
    else if (chainMismatch) showErr(chainWarnEl.textContent || tr('chainMismatchWarn').replace('{chain}', '').replace('{current}', ''));
    else if (tokenMismatch) showErr(tokenWarnEl.textContent || tr('tokenMismatchWarn').replace('{token}', '').replace('{current}', ''));
    else if (invoiceExpTs !== null && Math.floor(Date.now() / 1000) > invoiceExpTs) showErr(tr('errExpired'));
    else if (!isHexAddress(to)) showErr(tr('errInvalidTo'));
    else if (units === null) showErr(tr('errInvalidAmount'));
    else if (connectedAddress && !hasBalance) showErr(tr('errInsufficient'));
  }

  async function connect() {
    showErr('');
    showOk('');
    setMsg('ウォレット接続中…');

    if (window.ethereum?.request) {
      try {
        await window.ethereum.request({ method: 'eth_requestAccounts' });
        await ensureChainInjected();
        browserProvider = new ethers.BrowserProvider(window.ethereum as any);
        signer = await browserProvider.getSigner();
        connectedAddress = await (signer as any).getAddress();
        setPill();
        setMsg('接続しました（Injected Wallet）。');
        await updateUsdcBalance();
        void runStartupDiagnostics();
        return;
      } catch (e: any) {
        showErr(`Injected接続に失敗: ${e?.message || e}`);
      }
    }

    // WalletConnect fallback (lazy-loaded to reduce initial bundle size)
    const { default: EthereumProvider } = await import('@walletconnect/ethereum-provider');
    wcProvider = await EthereumProvider.init({
      projectId: WC_PROJECT_ID,
      chains: [chainCfg().chainId],
      optionalChains: [chainCfg().chainId],
      showQrModal: true,
    });
    await wcProvider.connect();
    browserProvider = new ethers.BrowserProvider(wcProvider);
    signer = await browserProvider.getSigner();
    connectedAddress = await (signer as any).getAddress();
    await ensureChainWc();
    setPill();
    setMsg('接続しました（WalletConnect）。');
    await updateUsdcBalance();
    void runStartupDiagnostics();
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
    void runStartupDiagnostics();
  }

  async function pay() {
    showErr('');
    showOk('');

    if (!connectedAddress) return showErr('先にウォレット接続してください。');

    const to = toEl.value.trim();
    const amount = amountEl.value.trim();
    const memo = memoEl.value.trim();
    const invoiceId = invoiceIdEl.value.trim();
    const units = usdcToUnits(amount);

    if (!isHexAddress(to)) return showErr('宛先(to)が不正です。');
    if (units === null) return showErr('金額が不正です。');
    if (invoiceSigMismatch) return showErr(tr('sigMismatchWarn'));
    if (hasInvoiceContext && invoiceContextChain && invoiceContextChain !== currentChain) {
      const tpl = tr('chainMismatchWarn');
      return showErr(tpl.replace('{chain}', CHAIN_CONFIGS[invoiceContextChain].label).replace('{current}', chainCfg().label));
    }
    if (hasInvoiceContext && invoiceContextToken && invoiceContextToken !== currentTokenKey) {
      const tpl = tr('tokenMismatchWarn');
      return showErr(tpl.replace('{token}', invoiceContextToken.toUpperCase()).replace('{current}', currentTokenKey.toUpperCase()));
    }
    if (invoiceExpTs !== null && Math.floor(Date.now() / 1000) > invoiceExpTs) return showErr('この請求リンクは期限切れです。');
    if (usdcBalanceUnits < units) return showErr('USDC残高が不足しています。');

    if (to.toLowerCase() === connectedAddress.toLowerCase()) {
      showErr('注意: 宛先(to)が送金元と同じアドレスです（テスト用途ならOK）。');
    }

    setMsg('トランザクション作成中…');

    try {
      if (wcProvider) await ensureChainWc();
      else await ensureChainInjected();

      const iface = new ethers.Interface(['function transfer(address to, uint256 value)']);
      const data = iface.encodeFunctionData('transfer', [to, units]);
      const txParams = { from: connectedAddress, to: tokenCfg().address, data, value: '0x0' };

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
      const paidAt = Date.now();
      savePaymentHistory({ ts: paidAt, txHash: hash, to, amount, memo, invoiceId });
      saveLastPaymentSummary({ ts: paidAt, txHash: hash, to, amount, memo, invoiceId });
      renderLastPaymentSummary();
      await updateUsdcBalance();

      if (memo || invoiceId) {
        try {
          await navigator.clipboard.writeText(`${memo ? `memo: ${memo}\n` : ''}${invoiceId ? `invoiceId: ${invoiceId}\n` : ''}tx: ${hash}`);
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
      lastVerifyText = lang === 'ja' ? '照合失敗: Txハッシュ形式が不正です。' : 'Verification failed: invalid Tx hash format.';
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
      const res = await fetch(chainCfg().rpcUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      const rcpt = json?.result;
      if (!rcpt) {
        verifyResultEl.innerHTML = `未確認（pending か未検出）: <a target="_blank" rel="noreferrer" href="${chainCfg().explorer}/tx/${hash}">Explorerで確認</a>`;
        lastVerifyText = `tx: ${hash}\nstatus: pending_or_not_found\nlink: ${chainCfg().explorer}/tx/${hash}`;
        return;
      }

      const ok = rcpt.status === '0x1';
      const transferTopic = ethers.id('Transfer(address,address,uint256)').toLowerCase();
      let matchedTo = false;
      let matchedAmount = false;
      let foundTransfer = false;

      if (Array.isArray(rcpt.logs)) {
        for (const l of rcpt.logs) {
          if ((l?.address || '').toLowerCase() !== tokenCfg().address.toLowerCase()) continue;
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
      const transferText = foundTransfer ? `${tokenCfg().symbol} Transferログあり` : `${tokenCfg().symbol} Transferログ未検出`;
      const toText = isHexAddress(expectedTo) ? (matchedTo ? '宛先一致' : '宛先不一致') : '宛先未入力';
      const amountText = expectedUnits !== null ? (matchedAmount ? '金額一致' : '金額不一致') : '金額未入力';
      const verifyOk = ok && foundTransfer && (!isHexAddress(expectedTo) || matchedTo) && (expectedUnits === null || matchedAmount);
      const judge = verifyOk ? '<b style="color:var(--ok)">検証OK</b>' : '<b style="color:var(--danger)">要確認</b>';

      const block = parseInt(rcpt.blockNumber || '0x0', 16);
      verifyResultEl.innerHTML = `${judge} / 実行: <b>${statusText}</b> / ${transferText} / ${toText} / ${amountText} / block: <span class="mono">${block}</span> / <a target="_blank" rel="noreferrer" href="${chainCfg().explorer}/tx/${hash}">Explorer</a>`;
      lastVerifyText = [
        `tx: ${hash}`,
        `verify: ${verifyOk ? 'ok' : 'review'}`,
        `execution: ${ok ? 'success' : 'failed'}`,
        `usdc_transfer_log: ${foundTransfer ? 'yes' : 'no'}`,
        `to_match: ${matchedTo ? 'yes' : 'no'}`,
        `amount_match: ${matchedAmount ? 'yes' : 'no'}`,
        `block: ${block}`,
        `link: ${chainCfg().explorer}/tx/${hash}`, 
      ].join('\n');
    } catch (e: any) {
      const m = e?.message || String(e);
      verifyResultEl.innerHTML = `<span class="warn">照合失敗: ${m}</span>`;
      lastVerifyText = `tx: ${hash}\nverify: error\nmessage: ${m}`;
    }
  }

  function init() {
    const u0 = new URL(location.href);
    const p = u0.searchParams;
    const langParam = p.get('lang');
    const savedLang = localStorage.getItem('agentpay_lang');
    lang = (langParam === 'en' || langParam === 'ja') ? langParam : ((savedLang === 'en' || savedLang === 'ja') ? savedLang : 'ja');
    const chainParam = p.get('chain');
    if (chainParam === 'eth' || chainParam === 'base') currentChain = chainParam;

    const tokenParam = p.get('token');
    if (tokenParam === 'usdc' || tokenParam === 'usdt') currentTokenKey = tokenParam;

    const dParam = p.get('d');
    const sigParam = p.get('sig') || '';
    const issuerParam = p.get('issuer') || '';
    const psigParam = p.get('psig') || '';
    hasInvoiceContext = !!(dParam || p.get('to') || p.get('amount'));
    invoiceContextChain = (chainParam === 'eth' || chainParam === 'base') ? chainParam : null;
    const unpacked = dParam ? decodeCompact(dParam) : null;
    const unpackedToken = unpacked?.tk;
    if (unpackedToken === 'usdc' || unpackedToken === 'usdt') currentTokenKey = unpackedToken;
    invoiceContextToken = (unpackedToken === 'usdc' || unpackedToken === 'usdt') ? unpackedToken : ((tokenParam === 'usdc' || tokenParam === 'usdt') ? tokenParam : null);

    const defTo = unpacked?.t || p.get('to') || '0x05BFC95c50750A2B530F5D1Ecb949F05Bfb764EC';
    const defAmount = unpacked?.a || p.get('amount') || '';
    const defMemo = unpacked?.m || p.get('memo') || '';
    const defInvoiceId = unpacked?.i || p.get('invoiceId') || '';
    const expParam = String(unpacked?.e || p.get('exp') || '');

    // Tab: allow `tab=create` to open creator first
    const tabParam = p.get('tab');
    setTab(tabParam === 'create' ? 'create' : 'pay');

    // Lock via URL param
    compactMode = p.get('compact') !== '0';
    invoiceLocked = unpacked ? !!unpacked.l : p.get('lock') === '1';
    flexAmount = unpacked ? !!unpacked.f : p.get('flexAmount') === '1';
    invoiceExpTs = expParam && /^\d+$/.test(expParam) ? Number(expParam) : null;

    signedByIssuer = issuerParam || null;
    signedProof = psigParam || null;

    if (hasInvoiceContext && invoiceContextChain && sigParam) {
      const payload = {
        chain: invoiceContextChain,
        token: invoiceContextToken || 'usdc',
        to: defTo,
        amount: defAmount,
        memo: defMemo,
        invoiceId: defInvoiceId,
        exp: invoiceExpTs ? Math.floor(invoiceExpTs) : 0,
        lock: invoiceLocked ? 1 : 0,
        flex: flexAmount ? 1 : 0,
      };
      const expectedSig = makeInvoiceSig(payload);
      invoiceSigMismatch = expectedSig.toLowerCase() !== sigParam.toLowerCase();

      if (!invoiceSigMismatch && issuerParam && psigParam) {
        try {
          const recovered = ethers.verifyMessage(invoiceSignMessage(payload), psigParam);
          invoiceSigMismatch = recovered.toLowerCase() !== issuerParam.toLowerCase();
        } catch {
          invoiceSigMismatch = true;
        }
      }
    } else {
      invoiceSigMismatch = false;
    }

    toEl.value = defTo;
    amountEl.value = defAmount;
    memoEl.value = defMemo;
    invoiceIdEl.value = defInvoiceId;

    // Invoice creator defaults from current values
    invToEl.value = defTo;
    invAmountEl.value = defAmount;
    invMemoEl.value = defMemo;
    invInvoiceIdEl.value = defInvoiceId;
    if (invoiceExpTs) {
      const rem = Math.max(1, Math.floor((invoiceExpTs - Math.floor(Date.now() / 1000)) / 60));
      invExpMinEl.value = String(rem);
    } else {
      invExpMinEl.value = '0';
    }
    invoiceUrlEl.value = (isHexAddress(defTo) && defAmount) ? buildInvoiceUrl(defTo, defAmount, defMemo, defInvoiceId, invoiceExpTs) : '';
    updateInvoiceButtons();

    openInCbw.href = buildCbwDappLink(location.href);

    applyI18n();
    setLockUI();
    refresh();
    setPill();
    void runStartupDiagnostics();
  }

  function switchLang(next: Lang) {
    lang = next;
    localStorage.setItem('agentpay_lang', next);
    const u = new URL(location.href);
    u.searchParams.set('lang', next);
    history.replaceState(null, '', u.toString());
    applyI18n();
    setLockUI();
    setPill();
    refresh();
    void runStartupDiagnostics();
  }

  function switchChain(next: keyof typeof CHAIN_CONFIGS) {
    currentChain = next;
    clearSignedProof();
    const u = new URL(location.href);
    u.searchParams.set('chain', next);
    u.searchParams.set('token', currentTokenKey);
    history.replaceState(null, '', u.toString());
    applyI18n();
    refresh();
    void runStartupDiagnostics();
    if (connectedAddress) void updateUsdcBalance();
  }

  function switchToken(next: 'usdc' | 'usdt') {
    currentTokenKey = next;
    clearSignedProof();
    const u = new URL(location.href);
    u.searchParams.set('token', next);
    history.replaceState(null, '', u.toString());
    applyI18n();
    refresh();
    if (connectedAddress) void updateUsdcBalance();
  }

  chainSelEl.addEventListener('change', () => switchChain((chainSelEl.value === 'eth' ? 'eth' : 'base')));
  tokenSelEl.addEventListener('change', () => switchToken((tokenSelEl.value === 'usdt' ? 'usdt' : 'usdc')));
  langJaBtn.addEventListener('click', () => switchLang('ja'));
  langEnBtn.addEventListener('click', () => switchLang('en'));

  tabPayBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); setTab('pay'); setMsg('tab: pay'); });
  tabCreateBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); setTab('create'); setMsg('tab: create'); });

  connectBtn.onclick = () => void connect().catch((e) => showErr(e?.message || String(e)));
  disconnectBtn.onclick = () => void disconnect();
  (payBtn as HTMLButtonElement).onclick = () => void pay();
  useMyAddressBtn.onclick = () => {
    if (!connectedAddress) {
      showErr(lang === 'ja' ? '先にウォレット接続してください。' : 'Please connect wallet first.');
      return;
    }
    toEl.value = connectedAddress;
    refresh();
    toast(lang === 'ja' ? '宛先に接続アドレスを入力しました' : 'Filled recipient with connected address');
  };

  // Invoice creator actions
  function updateInvoiceButtons() {
    const has = !!invoiceUrlEl.value;
    copyInvoiceBtn.disabled = !has;
    openInvoiceEl.style.pointerEvents = has ? 'auto' : 'none';
    openInvoiceEl.style.opacity = has ? '1' : '.55';
    openInvoiceEl.href = has ? invoiceUrlEl.value : '#';
  }

  signInvoiceBtn.onclick = async () => {
    if (!signer || !connectedAddress) {
      showErr(lang === 'ja' ? '先にウォレット接続してください。' : 'Please connect wallet first.');
      return;
    }
    const to = invToEl.value.trim();
    const amount = invAmountEl.value.trim();
    const memo = invMemoEl.value.trim();
    const invoiceId = invInvoiceIdEl.value.trim();
    const expMinRaw = invExpMinEl.value.trim();
    const expMin = expMinRaw ? Number(expMinRaw) : 0;
    if (!isHexAddress(to)) return showErr(lang === 'ja' ? '署名前に to を正しく入力してください。' : 'Please enter valid recipient before signing.');
    if (usdcToUnits(amount) === null) return showErr(lang === 'ja' ? '署名前に amount を正しく入力してください。' : 'Please enter valid amount before signing.');

    const expTs = expMin > 0 ? Math.floor(Date.now() / 1000) + Math.floor(expMin * 60) : 0;
    const payload = { chain: chainCfg().key, token: currentTokenKey, to, amount, memo, invoiceId, exp: expTs, lock: 1, flex: flexAmount ? 1 : 0 };
    try {
      const message = invoiceSignMessage(payload);
      const proof = await signer.signMessage(message);
      signedByIssuer = connectedAddress;
      signedProof = proof;
      refreshSignState();
      toast(lang === 'ja' ? '請求内容に署名しました' : 'Invoice payload signed');
    } catch (e: any) {
      showErr(e?.message || String(e));
    }
  };

  genBtn.onclick = async () => {
    const to = invToEl.value.trim();
    const amount = invAmountEl.value.trim();
    const memo = invMemoEl.value.trim();
    const invoiceId = invInvoiceIdEl.value.trim();
    const expMinRaw = invExpMinEl.value.trim();
    const expMin = expMinRaw ? Number(expMinRaw) : 0;
    if (!isHexAddress(to)) return showErr('Invoice to が不正です。');
    if (usdcToUnits(amount) === null) return showErr('Invoice amount が不正です（小数は6桁まで）。');
    if (!Number.isFinite(expMin) || expMin < 0) return showErr('有効期限（分）は0以上の数値で入力してください。');
    invoiceExpTs = expMin > 0 ? Math.floor(Date.now() / 1000) + Math.floor(expMin * 60) : null;
    invoiceUrlEl.value = buildInvoiceUrl(to, amount, memo, invoiceId, invoiceExpTs);
    saveInvoiceHistory({ ts: Date.now(), url: invoiceUrlEl.value, to, amount, memo, invoiceId, expTs: invoiceExpTs });
    updateInvoiceButtons();
    renderRecentInvoices();
    refresh();
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
    clearSignedProof();
    setLockUI();
  };

  compactBtn.onclick = () => {
    compactMode = !compactMode;
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
    invoiceIdEl.value = invInvoiceIdEl.value.trim();
    refresh();
  };

  tplSaveBtn.onclick = () => {
    const name = tplNameEl.value.trim();
    if (!name) {
      showErr(lang === 'ja' ? 'テンプレ名を入力してください。' : 'Please enter template name.');
      return;
    }
    const expMinRaw = invExpMinEl.value.trim();
    const expMin = expMinRaw ? Number(expMinRaw) : 0;
    const rec: InvoiceTemplate = {
      name,
      to: invToEl.value.trim(),
      amount: invAmountEl.value.trim(),
      memo: invMemoEl.value.trim(),
      invoiceId: invInvoiceIdEl.value.trim(),
      expMin: Number.isFinite(expMin) ? Math.max(0, expMin) : 0,
      flexAmount,
      compactMode,
    };
    const list = loadTemplates();
    const idx = list.findIndex((x) => x.name === name);
    if (idx >= 0) list[idx] = rec;
    else list.unshift(rec);
    saveTemplates(list);
    refreshTemplateSelect(name);
    toast(lang === 'ja' ? 'テンプレを保存しました' : 'Template saved');
  };

  tplLoadBtn.onclick = () => {
    const name = tplSelectEl.value;
    const t = loadTemplates().find((x) => x.name === name);
    if (!t) return;
    clearSignedProof();
    tplNameEl.value = t.name;
    invToEl.value = t.to || '';
    invAmountEl.value = t.amount || '';
    invMemoEl.value = t.memo || '';
    invInvoiceIdEl.value = t.invoiceId || '';
    invExpMinEl.value = String(t.expMin || 0);
    flexAmount = !!t.flexAmount;
    compactMode = t.compactMode !== false;
    setLockUI();
    toast(lang === 'ja' ? 'テンプレを読み込みました' : 'Template loaded');
  };

  tplDeleteBtn.onclick = () => {
    const name = tplSelectEl.value;
    if (!name) return;
    const list = loadTemplates().filter((x) => x.name !== name);
    saveTemplates(list);
    refreshTemplateSelect();
    toast(lang === 'ja' ? 'テンプレを削除しました' : 'Template deleted');
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

  shareInvoiceBtn.onclick = async () => {
    if (!invoiceUrlEl.value) return;
    const title = `AgentPay ${chainCfg().label} ${tokenCfg().symbol}`;
    const text = lang === 'ja'
      ? `請求リンクです（${chainCfg().label} / ${tokenCfg().symbol}）`
      : `Invoice link (${chainCfg().label} / ${tokenCfg().symbol})`;
    try {
      if (navigator.share) {
        await navigator.share({ title, text, url: invoiceUrlEl.value });
        toast(lang === 'ja' ? '共有ダイアログを開きました' : 'Share dialog opened');
      } else {
        await navigator.clipboard.writeText(invoiceUrlEl.value);
        toast(lang === 'ja' ? '共有API未対応のためURLをコピーしました' : 'Web Share unavailable; copied URL');
      }
    } catch (e: any) {
      // Ignore user-cancel silently
      if (e?.name === 'AbortError') return;
      showErr(e?.message || String(e));
    }
  };

  copyBtn.onclick = async () => {
    const to = toEl.value.trim();
    const amount = amountEl.value.trim();
    const memo = memoEl.value.trim();
    const invoiceId = invoiceIdEl.value.trim();
    const text = `to: ${to}\namount(${tokenCfg().symbol}): ${amount}${memo ? `\nmemo: ${memo}` : ''}${invoiceId ? `\ninvoiceId: ${invoiceId}` : ''}`;
    toast('コピー中…');
    try {
      await navigator.clipboard.writeText(text);
      toast('コピーしました');
    } catch (e) {
      showErr('コピーに失敗しました（ブラウザ権限の可能性）。');
      toast('コピー失敗');
    }
  };

  exportCsvBtn.onclick = () => {
    let rows = loadPaymentHistory();
    if (!rows.length) {
      toast(lang === 'ja' ? '履歴がありません' : 'No records yet');
      return;
    }

    const from = csvFromEl.value ? new Date(`${csvFromEl.value}T00:00:00`).getTime() : null;
    const to = csvToEl.value ? new Date(`${csvToEl.value}T23:59:59.999`).getTime() : null;
    if (from !== null) rows = rows.filter((r) => r.ts >= from);
    if (to !== null) rows = rows.filter((r) => r.ts <= to);

    const sort = csvSortEl.value;
    rows.sort((a, b) => {
      if (sort === 'invoiceIdAsc') return (a.invoiceId || '').localeCompare(b.invoiceId || '') || (a.ts - b.ts);
      if (sort === 'invoiceIdDesc') return (b.invoiceId || '').localeCompare(a.invoiceId || '') || (b.ts - a.ts);
      if (sort === 'timeAsc') return a.ts - b.ts;
      return b.ts - a.ts;
    });

    if (!rows.length) {
      toast(lang === 'ja' ? '条件に一致する履歴がありません' : 'No records match the selected filters');
      return;
    }

    const esc = (v: string) => `"${String(v || '').replace(/"/g, '""')}"`;
    const header = ['timestamp', 'txHash', 'to', `amount${tokenCfg().symbol}`, 'memo', 'invoiceId'];
    const body = rows.map((r) => [new Date(r.ts).toISOString(), r.txHash, r.to, r.amount, r.memo || '', r.invoiceId || '']);
    const csv = [header, ...body].map((line) => line.map(esc).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agentpay-payments-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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
  copyVerifyBtn.onclick = async () => {
    if (!lastVerifyText) {
      toast(lang === 'ja' ? '先に照合を実行してください' : 'Run verification first');
      return;
    }
    try {
      await navigator.clipboard.writeText(lastVerifyText);
      toast(lang === 'ja' ? '検証結果をコピーしました' : 'Copied verification result');
    } catch {
      showErr(lang === 'ja' ? 'コピーに失敗しました。' : 'Failed to copy.');
    }
  };
  verifyTxEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') void verifyTx();
  });

  toEl.addEventListener('input', () => { if (!invoiceLocked) refresh(); });
  amountEl.addEventListener('input', () => { if (!invoiceLocked) refresh(); });
  memoEl.addEventListener('input', () => { if (!invoiceLocked) refresh(); });
  invoiceIdEl.addEventListener('input', () => { if (!invoiceLocked) refresh(); });

  [invToEl, invAmountEl, invMemoEl, invInvoiceIdEl, invExpMinEl].forEach((el) => {
    el.addEventListener('input', () => clearSignedProof());
  });

  init();
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
});
