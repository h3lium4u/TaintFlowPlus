<?php
// Vulnerable PHP Snippets

// 1. Eval / System Command Injection
eval($_GET['code']);
system("ping -c 1 " . $_GET['ip']);
shell_exec("ping " . $_GET['ip']);

// 2. Local File Inclusion (LFI) / Path Traversal
include("templates/" . $_GET['page'] . ".php");
require_once("modules/" . $_POST['module']);

// 3. SQL Injection
$conn = mysqli_connect("localhost", "my_user", "my_password", "my_db");
mysqli_query($conn, "SELECT * FROM users WHERE username = '" . $_POST['username'] . "'");

// 4. XSS
echo "Hello " . $_GET['name'];
print("User: " . $_GET['user']);


// Safe PHP Snippets

// Safe Command execution with escapeshellarg
system("ping -c 1 " . escapeshellarg($_GET['ip']));

// Safe SQL Query with PDO
$stmt = $pdo->prepare('SELECT * FROM users WHERE username = :username');
$stmt->execute(['username' => $_POST['username']]);

// Safe XSS prevention with htmlspecialchars
echo "Hello " . htmlspecialchars($_GET['name'], ENT_QUOTES, 'UTF-8');
?>
