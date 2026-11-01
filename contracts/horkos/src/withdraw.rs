//! Withdrawals of internal balances to the caller's wallet.
//!
//! The balance is debited before the external `ft_transfer`; if the
//! transfer fails (e.g. the receiver is not registered with the token),
//! the callback credits it back, so no funds are lost.

use near_contract_standards::fungible_token::core::ext_ft_core;
use near_sdk::json_types::U128;
use near_sdk::{
    assert_one_yocto, env, log, near, require, AccountId, Gas, NearToken, Promise, PromiseError,
};

use crate::*;

const GAS_FT_TRANSFER: Gas = Gas::from_tgas(10);
const GAS_ON_WITHDRAW: Gas = Gas::from_tgas(10);

#[near]
impl Contract {
    /// Withdraws `amount` (default: everything) from the caller's seller
    /// earnings or mandate budget. Requires exactly 1 yoctoNEAR, so an
    /// agent's function-call key cannot call it.
    #[payable]
    pub fn withdraw(&mut self, from: WithdrawSource, amount: Option<U128>) -> Promise {
        assert_one_yocto();
        let account = env::predecessor_account_id();
        let available = self.available(&account, from);
        let amount = amount.map(|a| a.0).unwrap_or(available);
        require!(amount > 0, "Nothing to withdraw");
        require!(amount <= available, "Amount exceeds available balance");

        self.set_available(&account, from, available - amount);
        ext_ft_core::ext(self.token.clone())
            .with_attached_deposit(NearToken::from_yoctonear(1))
            .with_static_gas(GAS_FT_TRANSFER)
            .ft_transfer(
                account.clone(),
                U128(amount),
                Some("horkos withdraw".to_string()),
            )
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_ON_WITHDRAW)
                    .on_withdraw(account, from, U128(amount)),
            )
    }

    /// Restores the debited amount if the token transfer failed.
    /// Returns whether the withdrawal went through.
    #[private]
    pub fn on_withdraw(
        &mut self,
        account: AccountId,
        from: WithdrawSource,
        amount: U128,
        #[callback_result] result: Result<(), PromiseError>,
    ) -> bool {
        if result.is_ok() {
            return true;
        }
        let available = self.available(&account, from);
        self.set_available(&account, from, available + amount.0);
        log!(
            "Withdraw of {} to {} failed; balance restored",
            amount.0,
            account
        );
        false
    }
}

impl Contract {
    fn available(&self, account: &AccountId, from: WithdrawSource) -> u128 {
        match from {
            WithdrawSource::Earnings => self.balances.get(account).unwrap_or(0),
            WithdrawSource::Budget => self.mandates.get(account).expect("No mandate").balance.0,
        }
    }

    /// Writes a balance. Earnings entries are kept at zero rather than
    /// removed, so a failed-withdraw restore never needs new storage.
    fn set_available(&mut self, account: &AccountId, from: WithdrawSource, value: u128) {
        match from {
            WithdrawSource::Earnings => {
                self.balances.insert(account, &value);
            }
            WithdrawSource::Budget => {
                let mut m = self.mandates.get(account).expect("No mandate");
                m.balance = U128(value);
                self.mandates.insert(account, &m);
            }
        }
    }
}
