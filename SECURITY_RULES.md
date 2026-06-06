# TaintFlow+ Static Security Analysis Rules

TaintFlow+ features a multi-language, high-performance static security analysis engine that scans code dynamically for common vulnerabilities, misconfigurations, and code quality issues. 

This document defines all security rules implemented in the engine, categorized by language and severity priority.

---

## Severity Priorities
Security findings are classified into four severity tiers based on their potential impact:

1. **🔴 CRITICAL**: Vulnerabilities enabling Remote Code Execution (RCE), SQL Injection, Command Injection, or Local File Inclusion.
2. **🟠 HIGH**: Vulnerabilities leading to Cross-Site Scripting (XSS), Server-Side Request Forgery (SSRF), Hardcoded Secrets, or Weak Cryptography.
3. **🟡 MEDIUM**: Risks like Log Injection, NoSQL Injection, XML External Entity (XXE) Injection, CRLF Injection, and Open Redirects.
4. **🟢 LOW**: Information disclosure risks, including active Debug Configurations and Verbose Stack Traces.

---

## 1. Remote Code Execution (RCE) & Arbitrary Code Execution
Execution of untrusted input as system shell code or interpreter instructions.

| Language | Rule ID | Detection Pattern | Severity | Suggested Fix |
|---|---|---|---|---|
| **Python** | `python-rce` | `eval(`, `exec(`, `compile(`, `__import__` | 🔴 Critical | Use safe parser (e.g. `json.loads`) or function map tables. |
| **JS/TS** | `javascript-rce` | `eval(`, `Function(`, `setTimeout(str)`, `setInterval(str)` | 🔴 Critical | Avoid dynamic compiler code. Pass functions instead of strings. |
| **Java** | `java-rce` | `ScriptEngine.eval(`, `Runtime.exec(`, `ProcessBuilder(` | 🔴 Critical | Do not compile untrusted code blocks dynamically. |
| **PHP** | `php-rce` | `eval(`, `assert(`, `preg_replace` with `/e` modifier | 🔴 Critical | Eliminate eval expressions entirely; sanitize inputs. |
| **Ruby** | `ruby-rce` | `eval(`, `instance_eval(`, `class_eval(` | 🔴 Critical | Do not run Ruby evaluation constructs on dynamic inputs. |
| **R** | `r-rce` | `eval(`, `parse(`, `system(`, `system2(`, `shell(` | 🔴 Critical | Avoid parsing/evaluating dynamic strings or spawning raw system commands. |
| **C/C++** | `cpp-cmd-inj` | `system(`, `popen(`, `execvp(`, `execlp(`, `execle(`, `execv(`, `execl(` | 🔴 Critical | Avoid executing shell wrappers; use safer process execution APIs. |
| **C/C++** | `cpp-format-string` | `printf(var)`, `fprintf(`, `sprintf(`, `snprintf(` | 🔴 Critical | Never pass variable strings as format parameters. Format explicitly: `printf("%s", var)`. |

---

## 2. SQL Injection (SQLi)
Injecting untrusted input into database query syntax.

| Language | Rule ID | Detection Pattern | Severity | Suggested Fix |
|---|---|---|---|---|
| **Python** | `python-sqli` | string interpolation (`f"..."`, `"%s" %`, `.format()`) inside `execute()` | 🔴 Critical | Use parameterized queries: `execute("SELECT ... WHERE name = %s", (username,))`. |
| **JS/TS** | `javascript-sqli` | template literals or string concatenation inside database queries | 🔴 Critical | Use query placeholders: `db.query('SELECT ... ?', [username])`. |
| **Java** | `java-sqli` | Statement executeQuery with string concatenation | 🔴 Critical | Use `PreparedStatement` with query parameter binding instead. |
| **PHP** | `php-sqli` | Concatenation in `mysqli_query` or PDO dynamic query | 🔴 Critical | Prepare statements using PDO: `$stmt = $pdo->prepare('...');`. |
| **Go** | `go-sqli` | String concatenation or `fmt.Sprintf` inside database query | 🔴 Critical | Pass parameters to query method: `db.Query("SELECT ... ?", input)`. |
| **Ruby** | `ruby-sqli` | Dynamic string interpolation inside `.where` or `.execute` | 🔴 Critical | Use array parameter syntax: `User.where("name = ?", input)`. |
| **Rust** | `rust-sqli` | Dynamic `format!` inside `sqlx::query` or query macros | 🔴 Critical | Bind inputs using query bindings: `query("... = $1").bind(input)`. |
| **C#** | `csharp-sqli` | Dynamic string concatenation in `FromSqlRaw` or `SqlCommand` | 🔴 Critical | Use parameter placeholders or Entity Framework parameterized bindings. |
| **SQL** | `sql-xp-cmdshell` | Invoking the MSSQL `xp_cmdshell` execute block | 🔴 Critical | Disable and remove `xp_cmdshell` database executions in production. |

---

## 3. OS Command Injection
Dynamic command construction and execution via OS subprocesses.

| Language | Rule ID | Detection Pattern | Severity | Suggested Fix |
|---|---|---|---|---|
| **Python** | `python-cmd-inj` | `os.system()`, `subprocess.call(..., shell=True)` | 🔴 Critical | Run subprocesses without a shell: `subprocess.run(list, shell=False)`. |
| **JS/TS** | `javascript-cmd-inj` | `child_process.exec()`, `child_process.spawn()` | 🔴 Critical | Use `child_process.execFile()` with strict parameter arguments. |
| **Java** | `java-cmd-inj` | `Runtime.getRuntime().exec()`, `ProcessBuilder` with concat | 🔴 Critical | Audit arguments. Avoid invoking platform shell (`cmd.exe`/`/bin/sh`). |
| **PHP** | `php-cmd-inj` | `system()`, `exec()`, `shell_exec()`, `passthru()` | 🔴 Critical | Escapeshellarg inputs: `system("command " . escapeshellarg($input))`. |
| **Go** | `go-cmd-inj` | `exec.Command()` with variable command arguments | 🔴 Critical | Pass command and arguments as individual slice items. |
| **Ruby** | `ruby-cmd-inj` | Backticks, `system()`, `exec()` with string interpolation | 🔴 Critical | Use multi-argument system calls: `system("ping", host_ip)`. |
| **Rust** | `rust-cmd-inj` | `Command::new()` spawning dynamic arguments | 🔴 Critical | Avoid raw shell wrapper arguments. Bind parameters individually. |
| **C#** | `csharp-cmd-inj` | `Process.Start()` with dynamic execution commands | 🔴 Critical | Set shell execute to false and configure command arguments list. |

---

## 4. Unsafe Deserialization
Deserializing untrusted data without schema or type validation.

| Language | Rule ID | Detection Pattern | Severity | Suggested Fix |
|---|---|---|---|---|
| **Python** | `python-deserialization` | `pickle.loads()`, `pickle.load()`, `yaml.load()` | 🔴 Critical | Use `yaml.safe_load()` or switch to structured JSON serialization. |
| **Java** | `java-deserialization` | `ObjectInputStream.readObject()`, `XMLDecoder.readObject()` | 🔴 Critical | Implement look-ahead validation or use secure serializers (JSON/Protocol Buffers). |
| **PHP** | `php-deserialization` | `unserialize()` | 🔴 Critical | Avoid php serialization formats. Use JSON/JSONB serialization. |
| **Ruby** | `ruby-deserialization` | `Marshal.load()`, `YAML.load()` | 🔴 Critical | Replace with `YAML.safe_load()` or secure parser options. |
| **YAML** | `yaml-unsafe-deserialization` | `!!python/object/apply`, `!!python/object/new`, `!!python/object`, `!unsafe`, `!load` | 🔴 Critical | Do not deserialize untrusted YAML using unsafe custom tags. |

---

## 5. Path Traversal & LFI
Opening or loading local filesystem paths using unsanitized user input.

| Language | Rule ID | Detection Pattern | Severity | Suggested Fix |
|---|---|---|---|---|
| **Python** | `python-path-traversal` | `open()` with variable paths containing dynamic formatting | 🔴 Critical | Restrict directories. Use `os.path.basename()` to clean filename variables. |
| **JS/TS** | `javascript-path-traversal` | `fs.readFileSync()`, `fs.createReadStream()` with variables | 🔴 Critical | Validate and resolve paths: resolve relative paths and verify whitelist. |
| **Java** | `java-path-traversal` | `new FileInputStream()`, `Files.readAllBytes()` with variables | 🔴 Critical | Validate and resolve absolute path and ensure folder confinement. |
| **PHP** | `php-path-traversal` | Dynamic `include()`, `require()`, `file_get_contents()` | 🔴 Critical | Match page requests against strict whitelist array options. |
| **Go** | `go-path-traversal` | `ioutil.ReadFile()`, `os.Open()` with parameter variables | 🔴 Critical | Use `filepath.Clean()` and ensure path resides in target directory. |
| **Rust** | `rust-path-traversal` | `fs::read()`, `File::open()` with dynamic variables | 🔴 Critical | Check for path normalization and restrict access scope. |
| **C#** | `csharp-path-traversal` | `File.ReadAllText()`, `File.OpenRead()` with variables | 🔴 Critical | Use path normalization and ensure subdirectory validation. |
| **R** | `r-path-traversal` | `read.csv()`, `read.table()`, `write.csv()`, `write.table()`, `load()`, `save()`, `readLines()`, `writeLines()` with variables | 🔴 Critical | Resolve paths statically or validate base directory paths dynamically. |

---

## 6. Cross-Site Scripting (XSS)
Injecting raw, untrusted user strings into DOM elements or server outputs.

| Language | Rule ID | Detection Pattern | Severity | Suggested Fix |
|---|---|---|---|---|
| **JS/TS** | `javascript-xss` | `innerHTML`, `outerHTML`, `document.write`, `dangerouslySetInnerHTML` | 🟠 High | Use `textContent` or use sanitizer libraries like `DOMPurify`. |
| **Angular** | `angular-xss` | `bypassSecurityTrustHtml`, `bypassSecurityTrustScript` | 🟠 High | Rely on Angular built-in sanitization. Avoid trust overrides. |
| **Vue** | `vue-xss` | `v-html` template directive usage | 🟠 High | Replace with standard template bindings (`{{ }}`) where possible. |
| **HTML** | `html-xss` | Inline event handlers (`onload=`, `onerror=`) or `<script>` tags | 🟠 High | Set a Content Security Policy (CSP) and use external, secure scripts. |
| **PHP** | `php-xss` | Dynamic `echo` or `print` outputting variables without escaping | 🟠 High | Wrap variable echo output inside `htmlspecialchars()`. |

---

## 7. Server-Side Request Forgery (SSRF)
Making external network requests to targets defined by variable input.

| Language | Rule ID | Detection Pattern | Severity | Suggested Fix |
|---|---|---|---|---|
| **Python** | `python-ssrf` | `requests.get()`, `urllib.request.urlopen()` with variables | 🟠 High | Implement a strict domain whitelist for outbound connections. |
| **JS/TS** | `javascript-ssrf` | `fetch()`, `axios.get()` with dynamic URLs | 🟠 High | Validate URL scheme and restrict network requests to internal API services. |
| **Java** | `java-ssrf` | `HttpClient.send()`, `URL.openStream()` with dynamic URL | 🟠 High | Use DNS resolution filtering to prevent targeting private networks. |
| **Go** | `go-ssrf` | `http.Get()`, `client.Do()` with variable URLs | 🟠 High | Restrict protocol handlers to `https` and enforce destination whitelist. |
| **PHP** | `php-ssrf` | `curl_exec()`, `file_get_contents()` targeting variables | 🟠 High | Enforce validation and configure safe curl parameters. |
| **Ruby** | `ruby-ssrf` | `Net::HTTP.get()`, `open()` targeting dynamic URL variables | 🟠 High | Validate destination endpoints prior to issuing web client requests. |

---

## 8. General & Shared Security Rules
Global patterns scanned across all supported source code languages.

| Category | Rule ID | Detection Pattern | Severity | Suggested Fix |
|---|---|---|---|---|
| **Secrets** | `all-hardcoded-secrets` | API keys, secret variables, Stripe keys, private keys | 🟠 High | Move values to environment variables or safe key vaults. |
| **Crypto** | `all-weak-crypto` | `md5`, `sha1`, `DES`, `RC4` | 🟠 High | Upgrade hashing and encryption to SHA-256 or bcrypt. |
| **Log Injection** | `all-log-injection` | String concatenation inside logger output fields | 🟡 Medium | Sanitize newlines and control characters from logged variables. |
| **CRLF Injection** | `crlf-injection` | Dynamic header setters: `setHeader()`, `response.headers` | 🟡 Medium | Filter input string parameter newlines (`\r` / `\n`) before setting header fields. |
| **Open Redirect** | `open-redirect` | Dynamic redirections: `redirect()`, `res.redirect()` | 🟡 Medium | Use relative redirect paths or check domain against allowed destinations. |
| **SQL Safety** | `sql-no-where` | `UPDATE` or `DELETE` statement without a `WHERE` clause | 🔴 Critical | Enforce search predicates using matching `WHERE` conditions. |
| **HTML Safety** | `html-script-http` | `<script src="http://...">` loading scripts | 🟠 High | Serve resources over HTTPS or add Subresource Integrity (SRI) hashes. |
| **HTML Safety** | `html-form-http` | `<form action="http://...">` form submissions | 🟡 Medium | Redirect form submit URLs to secure HTTPS targets. |
| **Debug Flags** | `debug-mode-on` | `DEBUG = True`, `display_errors = 1`, `env = 'development'` | 🟢 Low | Toggle flags to production configuration mode prior to deployment. |
| **Error Leakage** | `verbose-errors` | `traceback.format_exc()`, verbose error handlers | 🟢 Low | Replace dynamic stack traces with standardized user-friendly error messages. |
| **Comments** | `commented-keys` | Comment lines with `TODO: change key` or `# password =` | 🟢 Low | Keep code clean and exclude placeholder passwords or temporary credentials. |

---

## 9. Infrastructure as Code (IaC) & Container Security
Configuring infrastructure, containers, and orchestration manifests securely.

| Format / Tool | Rule ID | Detection Pattern | Severity | Suggested Fix |
|---|---|---|---|---|
| **Dockerfile** | `dockerfile-root-user` | `USER root` | 🟡 Medium | Avoid running containers as root. Specify a non-privileged `USER`. |
| **Dockerfile** | `dockerfile-curl-sh` | `curl ... | bash` or `curl ... | sh` | 🟠 High | Verify and checksum downloaded scripts before pipe execution. |
| **Dockerfile** | `dockerfile-add-instruction` | `ADD ` instruction | 🟢 Low | Use `COPY` instead of `ADD` unless specifically downloading remote URLs or extracting tar archives. |
| **Dockerfile** | `dockerfile-expose-ssh` | `EXPOSE 22` | 🟠 High | Do not run or expose SSH inside application containers. |
| **YAML** | `yaml-k8s-privilege` | `privileged: true`, `hostNetwork: true`, `hostPID: true` | 🟠 High | Run pods with restricted SecurityContext settings. |
| **YAML** | `yaml-hardcoded-secrets` | `api_key: "..."`, `password: "..."`, `token: "..."` | 🟠 High | Inject credentials via environment variables or secret volumes. |
| **R** | `r-weak-ssl` | `ssl_verifypeer = FALSE`, `ssl_verifypeer = 0` | 🟠 High | Always enable SSL peer verification for external request loaders. |

---

## Remediation Workflow
When a static pattern matches a vulnerability in your code, TaintFlow+ provides:
1. **Source Tracking**: Identifies ruleId and source logic.
2. **IDE Diagnostics**: Underlines the exact start and end column of the violation in real-time.
3. **Quick Fixes**: Select the diagnostic message to apply clean, secure, and parameterized remediation blocks automatically.

