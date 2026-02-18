# AgentPay

A tiny, non-custodial invoice link for **Base USDC** payments.

- ✅ No custody (you receive funds directly)
- ✅ Simple shareable invoice URL (`to`, `amount`, `memo`)
- ✅ Wallet deep link (EIP-681) for ERC-20 transfer on Base

## Demo / Usage

Open the static page:

- `agentpay/index.html`

Example invoice URL params:

```
?to=0xYourBaseAddress&amount=10&memo=task-123
```

## Details

See: [`agentpay/README.md`](./agentpay/README.md)

## Notes

- Base chain id: `8453`
- USDC contract (Base): `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
