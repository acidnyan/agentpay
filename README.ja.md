# AgentPay

[![日本語](https://img.shields.io/badge/lang-日本語-0ea5e9)](./README.ja.md)
[![English](https://img.shields.io/badge/lang-English-22c55e)](./README.md)

**日本語** | [English](./README.md)

AgentPay は **Base USDC** 向けの、軽量なノンカストディ請求dAppです。

- ✅ ウォレット接続（Injected / WalletConnect）
- ✅ Base上でUSDC送金（Tx証跡あり）
- ✅ 請求作成（固定金額 / 任意金額リンク）
- ✅ 安全UX（ロック、残高確認、BaseScanリンク）

## デモ

- アプリ: https://acidnyan.github.io/agentpay/
- 請求作成タブ: https://acidnyan.github.io/agentpay/?tab=create

## 使い方（3ステップ）

1. **請求作成**タブを開く
2. `to / amount / memo` を設定し、固定 or 任意金額を選ぶ
3. **請求リンク生成** を押して共有する

## サンプルリンク

- 固定金額（ロック）:
  - https://acidnyan.github.io/agentpay/?tab=pay&lock=1&to=0x05BFC95c50750A2B530F5D1Ecb949F05Bfb764EC&amount=10&memo=task-123
- 任意金額（受取先固定）:
  - https://acidnyan.github.io/agentpay/?tab=pay&lock=1&flexAmount=1&to=0x05BFC95c50750A2B530F5D1Ecb949F05Bfb764EC&amount=10&memo=tips

## 技術

- Frontend: TypeScript + Vite
- Chain: Base（chain id `8453`）
- Token: USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`

## 注意

- このアプリはノンカストディ（秘密鍵を保持しない）です。
- ERC-20送金にメモは直接載らないため、メモはオフチェーン照合用です。

## 告知テンプレ

- 日本語: [OUTREACH.ja.md](./OUTREACH.ja.md)
- 英語: [OUTREACH.en.md](./OUTREACH.en.md)
