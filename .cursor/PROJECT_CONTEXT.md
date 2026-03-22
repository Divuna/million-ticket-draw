# OneMil Project Context

Project:
OneMil (Million Ticket Draw)

Goal:
Global contest platform where users purchase tickets using MioCoin.

Current phase:
System stability audit before production launch.

Primary objective:
Verify contest engine correctness.

Critical systems:

- contest engine
- ticket generation
- prize allocation
- winner selection
- wallet balances

System must guarantee:

- no duplicate tickets
- no duplicate winners
- no incorrect wallet balances
- no inconsistent contest states

Workflow:

ChatGPT:
system architecture
debugging strategy
audit planning

Cursor:
repository analysis
code auditing
implementation

Important:
Cursor must not modify contest engine or database logic until the audit is completed.