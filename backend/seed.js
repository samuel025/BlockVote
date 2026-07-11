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

  // Drop existing tables to apply schema changes
  db.exec("DROP TABLE IF EXISTS did_mappings");
  db.exec("DROP TABLE IF EXISTS students");
  db.exec("DROP TABLE IF EXISTS elections");

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
    ["2021/1/81878CT", "Samuel Adetola", 1, "Computer Science", "SICT", 400, "ACTIVE", 2021, "samuel.a@st.futminna.edu.ng"],
    ["2021/1/81879CT", "Fatima Bello", 1, "Computer Science", "SICT", 400, "ACTIVE", 2021, "fatima.b@st.futminna.edu.ng"],
    ["2021/1/81880CT", "Chukwuemeka Obi", 1, "Computer Science", "SICT", 400, "ACTIVE", 2021, "chukwuemeka.o@st.futminna.edu.ng"],
    ["2022/1/92001EE", "Amina Yusuf", 2, "Electrical Engineering", "SEET", 300, "ACTIVE", 2022, "amina.y@st.futminna.edu.ng"],
    ["2022/1/92002EE", "David Okonkwo", 2, "Electrical Engineering", "SEET", 300, "ACTIVE", 2022, "david.o@st.futminna.edu.ng"],
    ["2022/2/73001BA", "Grace Adeyemi", 3, "Business Administration", "SIT", 300, "ACTIVE", 2022, "grace.a@st.futminna.edu.ng"],
    ["2023/1/64001MC", "Ibrahim Musa", 4, "Mechatronics Engineering", "SEET", 200, "ACTIVE", 2023, "ibrahim.m@st.futminna.edu.ng"],
    ["2020/1/51001CT", "Blessing Eze", 1, "Computer Science", "SICT", 500, "GRADUATED", 2020, "blessing.e@st.futminna.edu.ng"],
    ["2021/2/42001AR", "Tunde Bakare", 5, "Architecture", "SET", 400, "SUSPENDED", 2021, "tunde.b@st.futminna.edu.ng"],
    ["2023/1/33001CV", "Ngozi Onyeka", 6, "Civil Engineering", "SEET", 200, "ACTIVE", 2023, "ngozi.o@st.futminna.edu.ng"],
    ["2021/1/81881CT", "Adebayo Oluwaseun", 1, "Computer Science", "SICT", 400, "ACTIVE", 2021, "adebayo.o@st.futminna.edu.ng"],
    ["2022/1/22001CH", "Halima Abdullahi", 8, "Chemical Engineering", "SEET", 300, "ACTIVE", 2022, "halima.a@st.futminna.edu.ng"],
    ["2023/2/11001EC", "Peter Okafor", 9, "Economics", "SET", 200, "ACTIVE", 2023, "peter.o@st.futminna.edu.ng"],
    ["2021/1/81882CT", "Esther Adeniyi", 1, "Computer Science", "SICT", 400, "ACTIVE", 2021, "esther.a@st.futminna.edu.ng"],
    ["2022/2/00001AC", "Mohammed Aliyu", 11, "Accounting", "SIT", 300, "ACTIVE", 2022, "mohammed.a@st.futminna.edu.ng"],
  ];

  const insertMany = db.transaction((students) => {
    for (const s of students) {
      insertStudent.run(...s);
    }
  });
  insertMany(students);

  console.log(`✓ Database seeded at ${DB_PATH}`);
  console.log(`  - ${students.length} students inserted`);
  console.log(`  - Active students: ${students.filter(s => s[6] === "ACTIVE").length}`);
  console.log(`  - Graduated: ${students.filter(s => s[6] === "GRADUATED").length}`);
  console.log(`  - Suspended: ${students.filter(s => s[6] === "SUSPENDED").length}`);

  db.close();
}

seed();
