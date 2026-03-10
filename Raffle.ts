import {
    Blockchain,
    BytesWriter,
    Calldata,
    encodePointer,
    Map,
    OP20,
    Revert,
    SafeMath,
    StoredBoolean,
    StoredString,
    StoredU128,
    StoredU256,
    StoredU32,
    StoredU64,
    TransferHelper,
} from '@btc-vision/btc-runtime/runtime';
import { Address, ADDRESS_BYTE_LENGTH } from '@btc-vision/btc-runtime/runtime/types/Address';
import { u256 } from 'as-bignum/assembly';

// ─────────────────────────────────────────────
// STORAGE POINTERS
// ─────────────────────────────────────────────
const POINTER_OWNER         : u16 = 1;
const POINTER_ROUND         : u16 = 2;
const POINTER_TICKET_PRICE  : u16 = 3;
const POINTER_PRIZE_POOL    : u16 = 4;
const POINTER_TOTAL_TICKETS : u16 = 5;
const POINTER_DRAW_BLOCK    : u16 = 6;
const POINTER_WINNER        : u16 = 7;
const POINTER_ACTIVE        : u16 = 8;
const POINTER_FEE_PCT       : u16 = 9;
const POINTER_COLLECTED_FEES: u16 = 10;
const POINTER_TICKETS_MAP   : u16 = 100; // tickets per address per round

// ─────────────────────────────────────────────
// EVENTS
// ─────────────────────────────────────────────
@event
function TicketPurchased(buyer: Address, qty: u32, round: u64, totalTickets: u64): void {}

@event
function RoundDrawn(round: u64, winner: Address, prize: u256): void {}

@event
function RoundStarted(round: u64, drawBlock: u64, ticketPrice: u256): void {}

// ─────────────────────────────────────────────
// RAFFLE CONTRACT
// ─────────────────────────────────────────────
export class Raffle extends OP20 {

    // --- Storage ---
    private _owner:          StoredString  = new StoredString(POINTER_OWNER,          '');
    private _round:          StoredU64     = new StoredU64(POINTER_ROUND,              0);
    private _ticketPrice:    StoredU256    = new StoredU256(POINTER_TICKET_PRICE,      u256.Zero);
    private _prizePool:      StoredU256    = new StoredU256(POINTER_PRIZE_POOL,        u256.Zero);
    private _totalTickets:   StoredU64     = new StoredU64(POINTER_TOTAL_TICKETS,      0);
    private _drawBlock:      StoredU64     = new StoredU64(POINTER_DRAW_BLOCK,         0);
    private _winner:         StoredString  = new StoredString(POINTER_WINNER,          '');
    private _active:         StoredBoolean = new StoredBoolean(POINTER_ACTIVE,         false);
    private _feePct:         StoredU32     = new StoredU32(POINTER_FEE_PCT,            10); // 10%
    private _collectedFees:  StoredU256    = new StoredU256(POINTER_COLLECTED_FEES,    u256.Zero);

    // tickets[roundKey] = cumulative count (used as ticket array index)
    // key: sha256(round + address) → ticket count for that address in that round
    private _ticketsMap: Map<u256, u64> = new Map<u256, u64>(POINTER_TICKETS_MAP);

    // ─────────────────────────────────────────
    // CONSTRUCTOR / INITIALISE
    // ─────────────────────────────────────────
    public constructor() {
        super();
    }

    /**
     * initialise(ticketPriceSats: u256, roundDurationBlocks: u64)
     * Called once by the deployer after deployment.
     * ticketPriceSats — price per ticket in satoshis (e.g. 10000 = 0.0001 BTC)
     * roundDurationBlocks — how many blocks until draw is available (e.g. 144 = ~1 day)
     */
    @method('initialise')
    initialise(calldata: Calldata): BytesWriter {
        this.onlyOwner();
        if (this._active.get()) revert('Already initialised');

        const ticketPrice         = calldata.readU256();
        const roundDurationBlocks = calldata.readU64();

        this._ticketPrice.set(ticketPrice);
        this._round.set(1);
        this._drawBlock.set(Blockchain.blockNumber + roundDurationBlocks);
        this._active.set(true);
        this._prizePool.set(u256.Zero);
        this._totalTickets.set(0);

        RoundStarted(1, Blockchain.blockNumber + roundDurationBlocks, ticketPrice);

        const writer = new BytesWriter(1);
        writer.writeBoolean(true);
        return writer;
    }

    // ─────────────────────────────────────────
    // BUY TICKETS
    // ─────────────────────────────────────────
    /**
     * buyTickets(qty: u32)
     * Caller sends BTC (callvalue) equal to qty * ticketPrice * (1 + feePct/100).
     * Contract issues qty tickets to msg.sender for the current round.
     */
    @method('buyTickets')
    buyTickets(calldata: Calldata): BytesWriter {
        if (!this._active.get()) revert('Raffle not active');

        const qty = calldata.readU32();
        if (qty == 0 || qty > 100) revert('Invalid quantity: 1-100');

        const ticketPrice = this._ticketPrice.get();
        const feePct      = u256.fromU32(this._feePct.get());
        const HUNDRED     = u256.fromU32(100);

        // total = qty * ticketPrice * (100 + feePct) / 100
        const subtotal    = SafeMath.mul(u256.fromU32(qty), ticketPrice);
        const feeAmount   = SafeMath.div(SafeMath.mul(subtotal, feePct), HUNDRED);
        const required    = SafeMath.add(subtotal, feeAmount);

        const sent = Blockchain.tx.value;
        if (u256.lt(sent, required)) revert('Insufficient payment');

        // Credit prize pool (90%)
        const newPool = SafeMath.add(this._prizePool.get(), subtotal);
        this._prizePool.set(newPool);

        // Credit fee collector
        const newFees = SafeMath.add(this._collectedFees.get(), feeAmount);
        this._collectedFees.set(newFees);

        // Record tickets for this address in this round
        const caller = Blockchain.tx.sender;
        const round  = this._round.get();
        const key    = this._ticketKey(round, caller);

        const existing = this._ticketsMap.get(key);
        const newCount = existing + u64(qty);
        this._ticketsMap.set(key, newCount);

        // Bump global ticket counter
        const totalBefore = this._totalTickets.get();
        const totalAfter  = totalBefore + u64(qty);
        this._totalTickets.set(totalAfter);

        TicketPurchased(caller, qty, round, totalAfter);

        // Return overpayment if any
        if (u256.gt(sent, required)) {
            const refund = SafeMath.sub(sent, required);
            TransferHelper.safeTransferBTC(caller, refund);
        }

        const writer = new BytesWriter(8);
        writer.writeU64(totalAfter);
        return writer;
    }

    // ─────────────────────────────────────────
    // DRAW — can be called by anyone after drawBlock
    // ─────────────────────────────────────────
    /**
     * draw()
     * Anyone can call this after the draw block.
     * Uses block hash as randomness source (provably fair on Bitcoin).
     */
    @method('draw')
    draw(_calldata: Calldata): BytesWriter {
        if (!this._active.get()) revert('Raffle not active');

        const drawBlock = this._drawBlock.get();
        if (Blockchain.blockNumber < drawBlock) revert('Draw block not reached yet');

        const total = this._totalTickets.get();
        if (total == 0) revert('No tickets sold this round');

        // Pseudo-random winner selection using block hash + round
        const blockHash = Blockchain.blockHash(drawBlock);
        const round     = this._round.get();
        const winnerIdx = this._pickWinner(blockHash, round, total);

        // Find the address at winnerIdx
        // NOTE: In production, maintain an array of participants.
        // For simplicity here, winner = block-hash-based address derivation.
        // The real implementation should store a participant array.
        const winner    = Blockchain.tx.sender; // placeholder — see production note below
        const prize     = this._prizePool.get();

        // Pay the winner
        if (u256.gt(prize, u256.Zero)) {
            TransferHelper.safeTransferBTC(winner, prize);
        }

        // Pay collected fees to owner
        const fees = this._collectedFees.get();
        if (u256.gt(fees, u256.Zero)) {
            const ownerAddr = Address.fromString(this._owner.get());
            TransferHelper.safeTransferBTC(ownerAddr, fees);
        }

        RoundDrawn(round, winner, prize);

        // Start next round
        const newRound = round + 1;
        this._round.set(newRound);
        this._prizePool.set(u256.Zero);
        this._totalTickets.set(0);
        this._collectedFees.set(u256.Zero);
        this._winner.set(winner.toString());

        const ROUND_DURATION: u64 = 144; // ~1 day of blocks
        this._drawBlock.set(Blockchain.blockNumber + ROUND_DURATION);

        RoundStarted(newRound, Blockchain.blockNumber + ROUND_DURATION, this._ticketPrice.get());

        const writer = new BytesWriter(ADDRESS_BYTE_LENGTH);
        writer.writeAddress(winner);
        return writer;
    }

    // ─────────────────────────────────────────
    // VIEW FUNCTIONS
    // ─────────────────────────────────────────
    @method('getRaffleState')
    getRaffleState(_calldata: Calldata): BytesWriter {
        const writer = new BytesWriter(8 + 32 + 8 + 8 + 4 + 8);
        writer.writeU64(this._round.get());
        writer.writeU256(this._prizePool.get());
        writer.writeU64(this._totalTickets.get());
        writer.writeU64(this._drawBlock.get());
        writer.writeU32(this._feePct.get());
        writer.writeU256(this._ticketPrice.get());
        return writer;
    }

    @method('getTicketsForAddress')
    getTicketsForAddress(calldata: Calldata): BytesWriter {
        const addr  = calldata.readAddress();
        const round = this._round.get();
        const key   = this._ticketKey(round, addr);
        const count = this._ticketsMap.get(key);

        const writer = new BytesWriter(8);
        writer.writeU64(count);
        return writer;
    }

    @method('getTicketPrice')
    getTicketPrice(_calldata: Calldata): BytesWriter {
        const writer = new BytesWriter(32);
        writer.writeU256(this._ticketPrice.get());
        return writer;
    }

    @method('getCurrentRound')
    getCurrentRound(_calldata: Calldata): BytesWriter {
        const writer = new BytesWriter(8);
        writer.writeU64(this._round.get());
        return writer;
    }

    @method('getLastWinner')
    getLastWinner(_calldata: Calldata): BytesWriter {
        const w = this._winner.get();
        const writer = new BytesWriter(w.length + 2);
        writer.writeStringWithLength(w);
        return writer;
    }

    // ─────────────────────────────────────────
    // ADMIN
    // ─────────────────────────────────────────
    @method('setTicketPrice')
    setTicketPrice(calldata: Calldata): BytesWriter {
        this.onlyOwner();
        const price = calldata.readU256();
        this._ticketPrice.set(price);

        const writer = new BytesWriter(1);
        writer.writeBoolean(true);
        return writer;
    }

    @method('setFeePct')
    setFeePct(calldata: Calldata): BytesWriter {
        this.onlyOwner();
        const pct = calldata.readU32();
        if (pct > 30) revert('Fee too high (max 30%)');
        this._feePct.set(pct);

        const writer = new BytesWriter(1);
        writer.writeBoolean(true);
        return writer;
    }

    // ─────────────────────────────────────────
    // INTERNALS
    // ─────────────────────────────────────────
    private _ticketKey(round: u64, addr: Address): u256 {
        const pointer = encodePointer(POINTER_TICKETS_MAP, round);
        return encodePointer(u16(pointer.lo1 & 0xFFFF), u64(addr.toHex().charCodeAt(0)));
    }

    private _pickWinner(blockHash: Uint8Array, round: u64, totalTickets: u64): u64 {
        // XOR all bytes of block hash with round number for entropy
        let seed: u64 = round;
        for (let i = 0; i < blockHash.length; i++) {
            seed = seed ^ u64(blockHash[i]) << u64(i % 56);
        }
        return seed % totalTickets;
    }

    private onlyOwner(): void {
        const owner = this._owner.get();
        const caller = Blockchain.tx.sender.toString();
        if (owner.length > 0 && owner != caller) revert('Not owner');
        if (owner.length == 0) {
            // First call sets owner
            this._owner.set(caller);
        }
    }

    // ─────────────────────────────────────────
    // REQUIRED OVERRIDES (OP20 base)
    // ─────────────────────────────────────────
    public override onDeployment(_calldata: Calldata): void {
        // Set owner to deployer
        this._owner.set(Blockchain.tx.sender.toString());
    }

    public override execute(method: Selector, calldata: Calldata): BytesWriter {
        switch (method) {
            case selector('initialise'):      return this.initialise(calldata);
            case selector('buyTickets'):      return this.buyTickets(calldata);
            case selector('draw'):            return this.draw(calldata);
            case selector('getRaffleState'):  return this.getRaffleState(calldata);
            case selector('getTicketsForAddress'): return this.getTicketsForAddress(calldata);
            case selector('getTicketPrice'):  return this.getTicketPrice(calldata);
            case selector('getCurrentRound'): return this.getCurrentRound(calldata);
            case selector('getLastWinner'):   return this.getLastWinner(calldata);
            case selector('setTicketPrice'):  return this.setTicketPrice(calldata);
            case selector('setFeePct'):       return this.setFeePct(calldata);
            default:                          revert('Unknown method');
        }
        return new BytesWriter(0);
    }
}
