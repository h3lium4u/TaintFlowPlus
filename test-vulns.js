// 1. Hardcoded Secret / Key
const apiKey = "AKIAIOSFODNN7EXAMPLE";

// 2. console.log password
const password = "mySecurePassword123";
console.log(password);

// 3. SQL Injection
const sqlQuery = "SELECT * FROM users WHERE name = '" + userName + "' AND pass = '" + userPass + "'";

// 4. Insecure innerHTML
document.getElementById("output").innerHTML = "<div>" + sqlQuery + "</div>";

// 5. Dangerous eval
eval("const malicious = true;");
