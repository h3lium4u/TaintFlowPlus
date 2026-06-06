package main

import (
	"database/sql"
	"fmt"
	"os/exec"
)

func vulnerable(userInput string, db *sql.DB) {
	// 1. Command Injection
	cmd := exec.Command("sh", "-c", "echo "+userInput)
	cmd.Run()

	// 2. SQL Injection
	query := fmt.Sprintf("SELECT * FROM users WHERE username = '%s'", userInput)
	db.Query(query)
}

func safe(userInput string, db *sql.DB) {
	// Safe Command execution
	cmd := exec.Command("echo", userInput)
	cmd.Run()

	// Safe SQL execution
	db.Query("SELECT * FROM users WHERE username = ?", userInput)
}
