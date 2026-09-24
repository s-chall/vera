# Signup

## Intent

A calm, progressive account flow that separates public identity from private verification.

## Structure

- Single centered form with a small Vera header and no marketing panel.
- Step 1: Journalist, Activist, or Media and account credentials.
- Step 2: public pseudonym, handle, and optional bio.
- Step 3, journalists only: CNP number, ID number, name and surname, and government ID.
- Step 3, media only: work email, approved-domain check, and emailed verification code.
- Completion sends the user directly to the article editor.

## Interaction

- Always show progress as “Step x of y” and with a progress rule.
- Keep labels visible and preserve password-manager/autofill behavior.
- Journalists and Media receive role-specific verification steps; activists never see unnecessary identity fields.
- The current Media domain lookup and verification code are front-end demo states until the database and email service are connected.
- Document selection displays the filename before submission.

## Responsive behavior

- On mobile, the single-column form uses 16px gutters.
- Role controls and form actions stack only when necessary.
- Every action remains at least 44px high.
