/**
 * Database Seed Script
 *
 * Creates and populates a simulated university student database (SQLite)
 * with enrollment records for testing the voting system.
 */

const Database = require("better-sqlite3");
const path = require("path");

const DB_PATH = path.join(__dirname, "university.db");

function seed() {
  const db = new Database(DB_PATH);

  // Create students table
  db.exec(`
    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      matric_number TEXT UNIQUE NOT NULL,
      full_name TEXT NOT NULL,
      department_id INTEGER NOT NULL,
      department_name TEXT NOT NULL,
      faculty TEXT NOT NULL,
      level INTEGER NOT NULL,
      enrollment_status TEXT NOT NULL DEFAULT 'ACTIVE',
      enrollment_year INTEGER NOT NULL,
      email TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create DID mappings table
  db.exec(`
    CREATE TABLE IF NOT EXISTS did_mappings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      matric_number TEXT UNIQUE NOT NULL,
      did_hash TEXT NOT NULL,
      enrollment_commitment TEXT NOT NULL,
      enrollment_secret TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (matric_number) REFERENCES students(matric_number)
    )
  `);

  // Create elections table
  db.exec(`
    CREATE TABLE IF NOT EXISTS elections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      election_id INTEGER UNIQUE NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      start_time DATETIME,
      end_time DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Clear existing data
  db.exec("DELETE FROM did_mappings");
  db.exec("DELETE FROM students");
  db.exec("DELETE FROM elections");

  // Insert sample students (simulating Federal University Otuoke student database)
  const insertStudent = db.prepare(`
    INSERT INTO students (matric_number, full_name, department_id, department_name, faculty, level, enrollment_status, enrollment_year, email)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const students = [
    ["FUO/21/CSC/001", "Adebayo Oluwaseun", 1, "Computer Science", "Science", 400, "ACTIVE", 2021, "adebayo.o@fuo.edu.ng"],
    ["FUO/21/CSC/002", "Fatima Bello", 1, "Computer Science", "Science", 400, "ACTIVE", 2021, "fatima.b@fuo.edu.ng"],
    ["FUO/21/CSC/003", "Chukwuemeka Obi", 1, "Computer Science", "Science", 400, "ACTIVE", 2021, "chukwuemeka.o@fuo.edu.ng"],
    ["FUO/22/EEE/001", "Amina Yusuf", 2, "Electrical Engineering", "Engineering", 300, "ACTIVE", 2022, "amina.y@fuo.edu.ng"],
    ["FUO/22/EEE/002", "David Okonkwo", 2, "Electrical Engineering", "Engineering", 300, "ACTIVE", 2022, "david.o@fuo.edu.ng"],
    ["FUO/22/BUS/001", "Grace Adeyemi", 3, "Business Administration", "Management Sciences", 300, "ACTIVE", 2022, "grace.a@fuo.edu.ng"],
    ["FUO/23/BIO/001", "Ibrahim Musa", 4, "Biology", "Science", 200, "ACTIVE", 2023, "ibrahim.m@fuo.edu.ng"],
    ["FUO/20/CSC/001", "Blessing Eze", 1, "Computer Science", "Science", 500, "GRADUATED", 2020, "blessing.e@fuo.edu.ng"],
    ["FUO/21/LAW/001", "Tunde Bakare", 5, "Law", "Law", 400, "SUSPENDED", 2021, "tunde.b@fuo.edu.ng"],
    ["FUO/23/MED/001", "Ngozi Onyeka", 6, "Medicine", "Health Sciences", 200, "ACTIVE", 2023, "ngozi.o@fuo.edu.ng"],
    ["FUO/21/PHY/001", "Samuel Adetola", 7, "Physics", "Science", 400, "ACTIVE", 2021, "samuel.a@fuo.edu.ng"],
    ["FUO/22/CHM/001", "Halima Abdullahi", 8, "Chemistry", "Science", 300, "ACTIVE", 2022, "halima.a@fuo.edu.ng"],
    ["FUO/23/ECO/001", "Peter Okafor", 9, "Economics", "Social Sciences", 200, "ACTIVE", 2023, "peter.o@fuo.edu.ng"],
    ["FUO/21/MAT/001", "Esther Adeniyi", 10, "Mathematics", "Science", 400, "ACTIVE", 2021, "esther.a@fuo.edu.ng"],
    ["FUO/22/ACC/001", "Mohammed Aliyu", 11, "Accounting", "Management Sciences", 300, "ACTIVE", 2022, "mohammed.a@fuo.edu.ng"],
  ];

  const insertMany = db.transaction((students) => {
    for (const s of students) {
      insertStudent.run(...s);
    }
  });
  insertMany(students);

  // Insert a sample election
  db.prepare(`
    INSERT INTO elections (title, election_id, status, start_time, end_time)
    VALUES (?, ?, ?, datetime('now'), datetime('now', '+1 day'))
  `).run("2025 SUG Presidential Election", 1, "ACTIVE");

  console.log(`✓ Database seeded at ${DB_PATH}`);
  console.log(`  - ${students.length} students inserted`);
  console.log(`  - Active students: ${students.filter(s => s[6] === "ACTIVE").length}`);
  console.log(`  - Graduated: ${students.filter(s => s[6] === "GRADUATED").length}`);
  console.log(`  - Suspended: ${students.filter(s => s[6] === "SUSPENDED").length}`);

  db.close();
}

seed();
