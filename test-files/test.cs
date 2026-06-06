using System;
using System.Diagnostics;
using System.Data.SqlClient;

public class TestCSharp {
    public void Vulnerable(string userInput) {
        // 1. SQL Injection
        using (SqlCommand cmd = new SqlCommand("SELECT * FROM users WHERE name = '" + userInput + "'")) {
            cmd.ExecuteReader();
        }

        // 2. Command Injection
        Process.Start("cmd.exe", "/c ping " + userInput);

        // 3. Path Traversal
        string content = System.IO.File.ReadAllText("files/" + userInput);
    }

    public void Safe(string userInput) {
        // Safe SQL Query
        using (SqlCommand cmd = new SqlCommand("SELECT * FROM users WHERE name = @name")) {
            cmd.Parameters.AddWithValue("@name", userInput);
            cmd.ExecuteReader();
        }

        // Safe Process execution without cmd shell
        Process.Start("ping.exe", userInput);
    }
}
