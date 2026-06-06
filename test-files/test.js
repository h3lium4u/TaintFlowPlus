// Vulnerable JavaScript Snippets
function vulnJS(userInput) {
    // 1. eval / Function constructor
    eval(userInput);
    new Function('user', userInput)();
    
    // 2. innerHTML
    document.getElementById('output').innerHTML = userInput;
    
    // 3. Child process command injection
    child_process.exec(`ping ${userInput}`);
    
    // 4. SQL Injection
    db.query(`SELECT * FROM users WHERE name = '${userInput}'`);
}

// Safe JavaScript Snippets
function safeJS(userInput) {
    // Safe innerHTML alternatives
    document.getElementById('output').textContent = userInput;
    
    // Safe child process execution
    child_process.execFile('ping', [userInput]);
    
    // Safe SQL parameters
    db.query('SELECT * FROM users WHERE name = ?', [userInput]);
}
