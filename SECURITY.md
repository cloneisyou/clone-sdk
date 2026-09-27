# Security

Report suspected vulnerabilities privately to [contact@clone.is](mailto:contact@clone.is) with the subject **Clone SDK security report**. This is Clone's published [security and privacy contact](https://clone.is/privacy). It is available to all reporters, including people without repository access or an existing integration contact. Do not use public issues for security reports or include live keys, personal data, or account screenshots. Include the affected SDK version, impact and a synthetic reproduction.

When this repository becomes public and private vulnerability reporting is enabled, GitHub's Security tab can also provide a private reporting form. Until that form is confirmed available, use the email address above.

App keys and PKCE flow state belong on your authenticated server. This SDK does not replace your session authentication, CSRF checks, origin policy, or per-user connection storage. The included loopback backend uses one synthetic identity and in-memory state; it is not a production authentication example.

The current preview is maintained on the latest 0.x version. There is no promised security-response SLA. Hosted service security and data-processing terms are separate from the SDK license.
