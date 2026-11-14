//! Testnet-only tUSDC faucet for Horkos.
//!
//! `claim()` sends a fixed amount (20 tUSDC) to the caller, at most once per
//! account per 24 hours and up to a total distribution cap. If the caller is
//! not registered with the token, the faucet pays its NEP-145 storage deposit
//! from its own NEAR balance. Only the owner can refill (`ft_transfer_call`
//! to the faucet), pause, or change the cap. Not for mainnet use.

use near_contract_standards::fungible_token::core::ext_ft_core;
use near_contract_standards::fungible_token::receiver::FungibleTokenReceiver;
use near_contract_standards::storage_management::ext_storage_management;
use near_sdk::json_types::{U128, U64};
use near_sdk::store::LookupMap;
use near_sdk::{
    env, log, near, require, AccountId, Gas, NearToken, PanicOnDefault, Promise, PromiseError,
    PromiseOrValue,
};

/// 24 hours in nanoseconds.
pub const COOLDOWN_NS: u64 = 24 * 3_600 * 1_000_000_000;
/// NEP-145 registration for the test token (125 bytes); any excess is refunded.
const STORAGE_DEPOSIT: NearToken = NearToken::from_micronear(1_250);
const GAS_STORAGE_DEPOSIT: Gas = Gas::from_tgas(5);
const GAS_FT_TRANSFER: Gas = Gas::from_tgas(10);
const GAS_ON_CLAIM: Gas = Gas::from_tgas(5);
/// Enough for the three calls above plus `claim` itself.
const MIN_CLAIM_GAS: Gas = Gas::from_tgas(30);

#[near(serializers = [json])]
pub struct FaucetInfo {
    pub owner: AccountId,
    pub token: AccountId,
    pub amount: U128,
    pub cap: U128,
    pub distributed: U128,
    pub paused: bool,
    pub cooldown_ms: U64,
}

#[derive(PanicOnDefault)]
#[near(contract_state)]
pub struct Contract {
    owner: AccountId,
    token: AccountId,
    amount: u128,
    cap: u128,
    distributed: u128,
    paused: bool,
    /// Last successful (or in-flight) claim per account, block time in ns.
    last_claim: LookupMap<AccountId, u64>,
}

#[near]
impl Contract {
    /// `amount` per claim and the total `cap`, both in token units (6 decimals for tUSDC).
    #[init]
    pub fn new(owner: AccountId, token: AccountId, amount: U128, cap: U128) -> Self {
        require!(amount.0 > 0 && cap.0 >= amount.0, "Need 0 < amount <= cap");
        Self {
            owner,
            token,
            amount: amount.0,
            cap: cap.0,
            distributed: 0,
            paused: false,
            last_claim: LookupMap::new(b"c"),
        }
    }

    /// Sends `amount` tUSDC to the caller. Registers the caller with the token first if needed.
    pub fn claim(&mut self) -> Promise {
        require!(!self.paused, "Faucet is paused");
        require!(env::prepaid_gas() >= MIN_CLAIM_GAS, "Attach at least 30 Tgas");
        let account = env::predecessor_account_id();
        let now = env::block_timestamp();
        let prev = self.last_claim.get(&account).copied();
        if let Some(t) = prev {
            require!(
                now >= t + COOLDOWN_NS,
                format!("Already claimed; next claim after {} ms", (t + COOLDOWN_NS) / 1_000_000)
            );
        }
        require!(self.distributed + self.amount <= self.cap, "Faucet cap reached");

        // Reserve before the async calls; on_claim releases it if the transfer fails.
        self.distributed += self.amount;
        self.last_claim.insert(account.clone(), now);

        // Registration only: refunds the whole deposit if the account is already registered.
        ext_storage_management::ext(self.token.clone())
            .with_attached_deposit(STORAGE_DEPOSIT)
            .with_static_gas(GAS_STORAGE_DEPOSIT)
            .storage_deposit(Some(account.clone()), Some(true))
            .then(
                ext_ft_core::ext(self.token.clone())
                    .with_attached_deposit(NearToken::from_yoctonear(1))
                    .with_static_gas(GAS_FT_TRANSFER)
                    .ft_transfer(account.clone(), U128(self.amount), Some("horkos faucet".to_string())),
            )
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_ON_CLAIM)
                    .on_claim(account, U128(self.amount), prev.map(U64)),
            )
    }

    /// Releases the reservation if `ft_transfer` failed. Returns whether the claim went through.
    #[private]
    pub fn on_claim(
        &mut self,
        account: AccountId,
        amount: U128,
        prev: Option<U64>,
        #[callback_result] result: Result<(), PromiseError>,
    ) -> bool {
        if result.is_ok() {
            log!("Sent {} to {}", amount.0, account);
            return true;
        }
        self.distributed -= amount.0;
        match prev {
            Some(t) => self.last_claim.insert(account.clone(), t.0),
            None => self.last_claim.remove(&account),
        };
        log!("Transfer to {} failed; claim released", account);
        false
    }

    /// Owner only.
    pub fn set_paused(&mut self, paused: bool) {
        self.assert_owner();
        self.paused = paused;
    }

    /// Owner only. Cannot go below what was already distributed.
    pub fn set_cap(&mut self, cap: U128) {
        self.assert_owner();
        require!(cap.0 >= self.distributed, "Cap below distributed");
        self.cap = cap.0;
    }

    pub fn get_info(&self) -> FaucetInfo {
        FaucetInfo {
            owner: self.owner.clone(),
            token: self.token.clone(),
            amount: U128(self.amount),
            cap: U128(self.cap),
            distributed: U128(self.distributed),
            paused: self.paused,
            cooldown_ms: U64(COOLDOWN_NS / 1_000_000),
        }
    }

    /// Unix ms from which `account_id` can claim again; `null` if it can claim now.
    pub fn next_claim_at(&self, account_id: AccountId) -> Option<U64> {
        let t = *self.last_claim.get(&account_id)?;
        let next = t + COOLDOWN_NS;
        (next > env::block_timestamp()).then(|| U64(next / 1_000_000))
    }
}

impl Contract {
    fn assert_owner(&self) {
        require!(env::predecessor_account_id() == self.owner, "Only the owner");
    }
}

#[near]
impl FungibleTokenReceiver for Contract {
    /// Refill: accepts the token only from the owner; anything else is returned.
    fn ft_on_transfer(&mut self, sender_id: AccountId, amount: U128, msg: String) -> PromiseOrValue<U128> {
        let _ = msg;
        if env::predecessor_account_id() != self.token || sender_id != self.owner {
            log!("Refill refused: only the owner can send {} here", self.token);
            return PromiseOrValue::Value(amount);
        }
        log!("Refilled with {}", amount.0);
        PromiseOrValue::Value(U128(0))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{accounts, VMContextBuilder};
    use near_sdk::testing_env;

    const T: u128 = 1_000_000;

    fn ctx(who: AccountId, now_ns: u64) {
        testing_env!(VMContextBuilder::new()
            .current_account_id("faucet.testnet".parse().unwrap())
            .predecessor_account_id(who)
            .block_timestamp(now_ns)
            .prepaid_gas(Gas::from_tgas(100))
            .account_balance(NearToken::from_near(5))
            .build());
    }

    fn setup(cap: u128) -> Contract {
        ctx(accounts(0), 0);
        Contract::new(accounts(0), "tusdc.testnet".parse().unwrap(), U128(20 * T), U128(cap))
    }

    #[test]
    fn claim_reserves_amount_and_records_time() {
        let mut c = setup(10_000 * T);
        ctx(accounts(1), 1_000);
        let _ = c.claim();
        assert_eq!(c.get_info().distributed.0, 20 * T);
        assert_eq!(c.next_claim_at(accounts(1)).unwrap().0, (1_000 + COOLDOWN_NS) / 1_000_000);
    }

    #[test]
    #[should_panic(expected = "Already claimed")]
    fn second_claim_within_24h_fails() {
        let mut c = setup(10_000 * T);
        ctx(accounts(1), 0);
        let _ = c.claim();
        ctx(accounts(1), COOLDOWN_NS - 1);
        let _ = c.claim();
    }

    #[test]
    fn claim_again_after_24h() {
        let mut c = setup(10_000 * T);
        ctx(accounts(1), 0);
        let _ = c.claim();
        ctx(accounts(1), COOLDOWN_NS);
        assert!(c.next_claim_at(accounts(1)).is_none());
        let _ = c.claim();
        assert_eq!(c.get_info().distributed.0, 40 * T);
    }

    #[test]
    fn cap_stops_claims() {
        let mut c = setup(40 * T);
        for i in 1..3 {
            ctx(accounts(i), 0);
            let _ = c.claim();
        }
        ctx(accounts(3), 0);
        let r = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| c.claim()));
        assert!(r.is_err());
        assert_eq!(c.get_info().distributed.0, 40 * T);
    }

    #[test]
    #[should_panic(expected = "Faucet is paused")]
    fn paused_faucet_refuses() {
        let mut c = setup(10_000 * T);
        c.set_paused(true);
        ctx(accounts(1), 0);
        let _ = c.claim();
    }

    #[test]
    #[should_panic(expected = "Only the owner")]
    fn only_owner_pauses() {
        let mut c = setup(10_000 * T);
        ctx(accounts(1), 0);
        c.set_paused(true);
    }

    #[test]
    #[should_panic(expected = "Attach at least 30 Tgas")]
    fn low_gas_refused() {
        let mut c = setup(10_000 * T);
        testing_env!(VMContextBuilder::new()
            .predecessor_account_id(accounts(1))
            .prepaid_gas(Gas::from_tgas(20))
            .build());
        let _ = c.claim();
    }

    #[test]
    fn failed_transfer_releases_claim() {
        let mut c = setup(10_000 * T);
        ctx(accounts(1), 0);
        let _ = c.claim();
        ctx("faucet.testnet".parse().unwrap(), 0);
        assert!(!c.on_claim(accounts(1), U128(20 * T), None, Err(PromiseError::Failed)));
        assert_eq!(c.get_info().distributed.0, 0);
        assert!(c.next_claim_at(accounts(1)).is_none());
    }

    #[test]
    fn failed_repeat_claim_restores_previous_time() {
        let mut c = setup(10_000 * T);
        ctx("faucet.testnet".parse().unwrap(), 0);
        c.distributed = 20 * T;
        assert!(!c.on_claim(accounts(1), U128(20 * T), Some(U64(5)), Err(PromiseError::Failed)));
        assert_eq!(c.last_claim.get(&accounts(1)).copied(), Some(5));
    }

    #[test]
    fn refill_only_from_owner_via_token() {
        let mut c = setup(10_000 * T);
        ctx("tusdc.testnet".parse().unwrap(), 0);
        assert!(matches!(c.ft_on_transfer(accounts(0), U128(5), String::new()), PromiseOrValue::Value(U128(0))));
        assert!(matches!(c.ft_on_transfer(accounts(1), U128(5), String::new()), PromiseOrValue::Value(U128(5))));
        ctx("other.testnet".parse().unwrap(), 0);
        assert!(matches!(c.ft_on_transfer(accounts(0), U128(5), String::new()), PromiseOrValue::Value(U128(5))));
    }

    #[test]
    fn set_cap_bounds() {
        let mut c = setup(100 * T);
        ctx(accounts(1), 0);
        let _ = c.claim();
        ctx(accounts(0), 0);
        c.set_cap(U128(20 * T));
        assert_eq!(c.get_info().cap.0, 20 * T);
        let r = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| c.set_cap(U128(T))));
        assert!(r.is_err());
    }
}
