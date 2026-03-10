# ⛓ OPNet SATS RAFFLE — Deploy Scripts

Script CLI untuk deploy dan berinteraksi dengan SATS RAFFLE smart contract di OPNet Bitcoin.

---

## 📋 Prasyarat

- **Node.js v18+** — cek: `node --version`
- **npm v8+** — cek: `npm --version`
- **OPWallet** — untuk mendapatkan seed phrase dan tBTC testnet
- **tBTC** — minimal 100,000 sats (dapatkan di https://faucet.opnet.org)
- **File Raffle.wasm** — hasil compile dari Raffle.ts

---

## 🚀 Setup Cepat

```bash
# 1. Masuk ke folder project
cd opnet-deploy-scripts

# 2. Install dependencies
npm install

# 3. Salin .env.example menjadi .env
cp .env.example .env

# 4. Edit .env dengan editor favorit
#    Isi MNEMONIC dengan seed phrase OPWallet-mu
nano .env
# atau: notepad .env  (Windows)
# atau: code .env     (VS Code)

# 5. Salin Raffle.wasm ke folder build/
mkdir -p build
cp /path/ke/Raffle.wasm ./build/Raffle.wasm

# 6. Deploy!
npm run deploy
```

---

## 📂 Struktur File

```
opnet-deploy-scripts/
├── deploy.mjs          ← Script deployment utama
├── initialise.mjs      ← Inisialisasi contract setelah deploy
├── buy-ticket.mjs      ← Beli tiket raffle
├── draw.mjs            ← Trigger draw (pilih pemenang)
├── get-state.mjs       ← Cek status contract
├── utils.mjs           ← Shared utilities
├── .env                ← ⚠ RAHASIA — jangan upload ke GitHub!
├── .env.example        ← Template konfigurasi
├── .gitignore          ← Pastikan .env tidak ter-commit
├── deployed.json       ← Auto-generated setelah deploy
└── package.json        ← Dependencies
```

---

## 🎮 Urutan Penggunaan

### Langkah 1 — Deploy Contract

```bash
# Dry run dulu untuk estimasi biaya
node deploy.mjs --dry-run

# Deploy sungguhan
npm run deploy
# atau: node deploy.mjs
```

**Output yang diharapkan:**
```
════════════════════════════════════════════════════════════
  ₿  SATS RAFFLE — Deploy Contract ke OPNet
════════════════════════════════════════════════════════════

── KONFIGURASI ───────────────────────────────────────────
  Network    : testnet
  RPC URL    : https://testnet.opnet.org
  Fee Rate   : 2 sat/vB
  ...

── WALLET ────────────────────────────────────────────────
  Deployer   : tb1p...

── CONTRACT BYTECODE ────────────────────────────────────
  File    : ./build/Raffle.wasm
  Size    : 45.23 KB (46318 bytes)

...

════════════════════════════════════════════════════════════
  ✅  DEPLOY BERHASIL!
════════════════════════════════════════════════════════════

  Contract Address : tb1p...
  Funding TX       : abc123...
  Deployment TX    : def456...

  🔍 Explorer : https://explorer.opnet.org/testnet/contract/tb1p...
```

Contract address otomatis disimpan ke `deployed.json` dan `CONTRACT_ADDRESS` di `.env`.

---

### Langkah 2 — Tunggu Konfirmasi

Setelah deploy, tunggu TX terkonfirmasi di testnet (~5-15 menit).

Cek status di:
- https://mempool.space/testnet/tx/DEPLOYMENT_TX_ID
- https://explorer.opnet.org/testnet/contract/CONTRACT_ADDRESS

---

### Langkah 3 — Initialise Contract

```bash
npm run initialise
# atau: node initialise.mjs
```

Memanggil `initialise(ticketPrice, roundDuration)` — **hanya bisa dilakukan sekali** oleh deployer.

---

### Langkah 4 — Beli Tiket

```bash
# Beli 1 tiket (default)
npm run buy-ticket
node buy-ticket.mjs

# Beli 5 tiket
node buy-ticket.mjs --qty 5

# Beli 10 tiket
node buy-ticket.mjs --qty 10
```

---

### Langkah 5 — Trigger Draw

Setelah draw block tercapai:

```bash
npm run draw
# atau: node draw.mjs
```

Bisa dipanggil oleh siapa saja (bukan hanya deployer) setelah draw block.

---

### Cek Status

```bash
npm run state
# atau: node get-state.mjs
```

---

## ⚙️ Konfigurasi (.env)

| Variable | Default | Keterangan |
|---|---|---|
| `MNEMONIC` | (wajib diisi) | Seed phrase 12/24 kata dari OPWallet |
| `NETWORK` | `testnet` | `testnet` atau `bitcoin` (mainnet) |
| `RPC_URL` | `https://testnet.opnet.org` | OPNet RPC endpoint |
| `CONTRACT_ADDRESS` | (otomatis) | Diisi otomatis setelah deploy |
| `TICKET_PRICE_SATS` | `10000` | Harga tiket dalam satoshi |
| `ROUND_DURATION_BLOCKS` | `6` | Durasi round dalam blok (6 = ~1 jam) |
| `PLATFORM_FEE_PCT` | `10` | Fee deployer dalam persen |
| `FEE_RATE` | `2` | sat/vB untuk fee jaringan |
| `FUNDING_AMOUNT_SATS` | `500000` | Sats yang disiapkan per TX deploy |

---

## 🔧 Troubleshooting

**Error: "Insufficient UTXOs"**
- Naikkan `FUNDING_AMOUNT_SATS` di .env
- Minta lebih banyak tBTC dari https://faucet.opnet.org

**Error: "Challenge API unavailable"**
- Cek koneksi internet
- Tunggu beberapa menit dan coba lagi

**Error: "MNEMONIC tidak valid"**
- Pastikan seed phrase di .env tepat 12 atau 24 kata
- Pisahkan dengan spasi, bukan koma

**Contract tidak muncul di Explorer**
- Tunggu 10-15 menit — testnet lebih lambat dari mainnet
- Cek TX di mempool.space/testnet terlebih dahulu

---

## 🔗 Link Penting

| Layanan | URL |
|---|---|
| OPNet Explorer Testnet | https://explorer.opnet.org/testnet |
| OPNet Faucet | https://faucet.opnet.org |
| Bitcoin Testnet Mempool | https://mempool.space/testnet |
| OPNet Docs | https://docs.opnet.org |
| OPNet GitHub | https://github.com/btc-vision |
| OPNet Discord | https://discord.com/invite/opnet |

---

## ⚠️ Keamanan

- **JANGAN pernah commit file `.env` ke GitHub**
- File `.gitignore` sudah dikonfigurasi untuk mencegah ini
- Gunakan wallet/mnemonic terpisah untuk deployment & testing
- Untuk mainnet: pertimbangkan menggunakan hardware wallet

---

*Dibuat untuk OPNet Testnet · 2025*
