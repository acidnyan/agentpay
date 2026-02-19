# AgentPay

AgentPay is a lightweight, non-custodial invoice dApp for **Base USDC**.

- ✅ Connect wallet (Injected / WalletConnect)
- ✅ Send USDC on Base with transaction proof
- ✅ Invoice creator with **fixed** or **flexible amount** links
- ✅ Safety UX: lock mode, balance check, BaseScan links

## Live Demo

- App: https://acidnyan.github.io/agentpay/
- Invoice Creator tab: https://acidnyan.github.io/agentpay/?tab=create

## 3-step usage

1. Open **請求作成** tab.
2. Set `to / amount / memo` and choose fixed or flexible amount.
3. Click **請求リンク生成** and share the generated URL.

## Example links

- Fixed amount (locked):
  - https://acidnyan.github.io/agentpay/?tab=pay&lock=1&to=0x05BFC95c50750A2B530F5D1Ecb949F05Bfb764EC&amount=10&memo=task-123
- Flexible amount (recipient fixed):
  - https://acidnyan.github.io/agentpay/?tab=pay&lock=1&flexAmount=1&to=0x05BFC95c50750A2B530F5D1Ecb949F05Bfb764EC&amount=10&memo=tips

## Tech

- Frontend: TypeScript + Vite
- Chain: Base (chain id `8453`)
- Token: USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`

## Notes

- This app is non-custodial (no private key storage).
- On-chain memo is not embedded in ERC-20 transfer; memo is for off-chain matching.
