# OneMil Database Instructions

Database: Supabase PostgreSQL

Critical tables:

contests
tickets
bonus_prizes
winners
wallets
payments
users
profiles

Key rules:

Tickets:
- ticket_number must be unique per contest

Winners:
- each prize must have only one winner

Wallets:
- wallet balance must always match transaction history

Payments:
- payment must be idempotent

Contest lifecycle:

draft
active
completed
cancelled

Important:

Database structure must never be modified automatically.

Cursor must always inspect:

- migrations
- triggers
- constraints
- indexes

before suggesting changes.
