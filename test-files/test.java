package test;

import java.io.*;
import java.sql.*;

public class TestJava {
    public void vulnerable(String userInput) throws Exception {
        // 1. Command Injection
        Runtime.getRuntime().exec("ping " + userInput);
        new ProcessBuilder("ping " + userInput).start();
        
        // 2. SQL Injection
        Connection conn = DriverManager.getConnection("jdbc:mysql://localhost/db", "user", "pass");
        Statement stmt = conn.createStatement();
        stmt.executeQuery("SELECT * FROM users WHERE name = '" + userInput + "'");
        
        // 3. Unsafe Deserialization
        ObjectInputStream ois = new ObjectInputStream(new FileInputStream(userInput));
        Object obj = ois.readObject();
    }

    public void safe(String userInput) throws Exception {
        // Safe Command execution
        new ProcessBuilder("ping", userInput).start();

        // Safe SQL Query
        Connection conn = DriverManager.getConnection("jdbc:mysql://localhost/db", "user", "pass");
        PreparedStatement pstmt = conn.prepareStatement("SELECT * FROM users WHERE name = ?");
        pstmt.setString(1, userInput);
        pstmt.executeQuery();
    }
}
