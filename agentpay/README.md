# AgentPay (MVP)

A tiny, non-custodial invoice link for **Base USDC** payments.

## What it does

- Generates a shareable URL with parameters:
  - `to` (recipient address)
  - `amount` (USDC, up to 6 decimals)
  - `memo` (optional)
- Provides:
  - Copy-friendly payment details
  - A wallet deep link (EIP-681) to execute an ERC-20 transfer
  - BaseScan link to verify the recipient address

## Usage

Open `index.html` in a browser, or host it as a static site.

Example:

```
/pay?to=0xYourBaseAddress&amount=10&memo=task-123
```

## Notes

- Base chain id: `8453`
- USDC contract (Base): `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- This project does **not** custody funds.

## Next improvements

- Optional payment detection (watch `Transfer` events to `to` with matching amount)
- “Paid” confirmation page (tx hash input + explorer link)
- Webhook/Telegram notifications
