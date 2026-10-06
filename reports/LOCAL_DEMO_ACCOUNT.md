# Local demo owner account

Date: 2026-10-06
Environment: `phan-gia-pha-local` Supabase stack and Next demo on `127.0.0.1:3100` only.

## Provisioning evidence

`pnpm.cmd demo:account:local` — **PASS**. The provisioner verified both Supabase Auth (`127.0.0.1:54321`) and PostgreSQL (`127.0.0.1:54322`) are the expected local endpoints before any write. It created one confirmed synthetic `@example.test` Auth identity, one empty tree with `data_mode='demo'`, one restricted demo branch, one active `owner` membership, and a redacted bootstrap audit event. It uses Supabase Auth's local admin endpoint for the Auth identity, then a single local PostgreSQL transaction for the bootstrap rows. No extra capability grants were inserted: the owner role is the top base role and receives role-derived authorization; policies such as current consent/visibility, MFA, and two-person separation still apply.

The script verified the owner membership/tree in the database and completed a password login through the local Next BFF. **No email/password, service-role key, session cookie, or owner UUID is included in this report or command output.** Credentials are stored locally in the ignored workspace file `.env.demo.local`; the script refuses to overwrite an existing file and removes its generated account/tree/credential file if verification fails.

## Using the account

Open `http://127.0.0.1:3100/dang-nhap` and read `DEMO_LOGIN_EMAIL` / `DEMO_LOGIN_PASSWORD` from `.env.demo.local` on this machine. The credential file is not loaded by Next.js and must not be committed or pasted into chat.

The account is `owner` on one empty synthetic demo tree. It is not simultaneously all five base roles; the database contract permits one membership role per user/tree, and `owner` is the highest role. The demo owner must enroll MFA before privileged AAL2 actions. A single account cannot approve its own changes or satisfy independent two-person review; a separate reviewer account would be required for those flows. This creates no real-family data and does not change the hosted Supabase project.
