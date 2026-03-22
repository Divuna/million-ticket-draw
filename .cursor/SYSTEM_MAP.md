# OneMil System Map

## Core Entities
users
profiles
wallets
vouchers
user_vouchers
tickets
winners
prizes
bonus_prizes
contests

## Payments
payments
partner_api_requests
partner_coin_activations

## Admin
admin_actions
admin_contest_status
admin_bonus_overview
admin_bonus_delivery_status

## Messaging
messages
notifications

## Events
event_logs
event_queue
event_forward_log

## Push
push_log
push_retry
user_devices

## Influencers
influencer_campaigns
influencer_campaign_events
influencer_campaign_partners
influencer_referrals
influencer_commissions

## Partners
partners
partner_api_keys
partner_api_key_usage
partner_api_activity
partner_invoices
partner_invoice_lines

## Referral
referrals
referral_codes
referral_rewards
referral_attempts

## Security
user_roles
roles
user_security_signals

## Content
banners
content_pages
contest_media
coming_soon_banners

## Cron
email_queue
cron_audit_log

## Core Logic
voucher purchase → payments → user_vouchers

voucher → mioCoin → ticket purchase

ticket purchase → tickets table

ticket == winning position → winners

event logs → event_queue → Sofinity

notifications → push_log → OneSignal