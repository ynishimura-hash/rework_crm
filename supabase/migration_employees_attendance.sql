-- 社員一覧
CREATE TABLE IF NOT EXISTS employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR NOT NULL,
  email VARCHAR,
  standard_work_hours NUMERIC(4,1),
  standard_work_days NUMERIC(4,1),
  standard_break_hours NUMERIC(4,1),
  hourly_rate INTEGER,
  status VARCHAR DEFAULT 'active',
  latest_work_date DATE,
  paid_leave_remaining NUMERIC(4,1),
  paid_leave_granted NUMERIC(4,1),
  paid_leave_grant_days NUMERIC(4,1),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 勤怠打刻
CREATE TABLE IF NOT EXISTS attendance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR,
  clock_time TIMESTAMPTZ,
  clock_type VARCHAR,
  employee_id UUID REFERENCES employees(id),
  employee_name VARCHAR,
  health_note TEXT,
  clock_datetime_record TIMESTAMPTZ,
  date DATE,
  gps_location TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 日次勤怠管理
CREATE TABLE IF NOT EXISTS daily_attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  date_formula VARCHAR,
  day_of_week VARCHAR,
  is_holiday BOOLEAN DEFAULT FALSE,
  employee_id UUID REFERENCES employees(id),
  employee_name VARCHAR,
  is_overtime BOOLEAN DEFAULT FALSE,
  break_excess BOOLEAN DEFAULT FALSE,
  clock_in TIMESTAMPTZ,
  clock_out TIMESTAMPTZ,
  break_start TIMESTAMPTZ,
  break_end TIMESTAMPTZ,
  work_hours NUMERIC(5,2),
  overtime_hours NUMERIC(5,2),
  break_hours_check NUMERIC(5,2),
  night_overtime_hours NUMERIC(5,2),
  holiday_work_hours NUMERIC(5,2),
  clock_diff_hours NUMERIC(5,2),
  break_hours NUMERIC(5,2),
  calc_break_hours NUMERIC(5,2),
  paid_leave BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 給与台帳
CREATE TABLE IF NOT EXISTS payroll (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR,
  employee_name VARCHAR,
  employee_id UUID REFERENCES employees(id),
  target_month VARCHAR,
  gross_salary INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 有休管理台帳
CREATE TABLE IF NOT EXISTS paid_leave_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR,
  employee_id UUID REFERENCES employees(id),
  employee_name VARCHAR,
  leave_date DATE,
  category VARCHAR,
  change_days NUMERIC(4,1),
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 有休申請
CREATE TABLE IF NOT EXISTS paid_leave_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR,
  applicant_name VARCHAR,
  employee_id UUID REFERENCES employees(id),
  application_date DATE,
  consumed_days NUMERIC(4,1),
  message TEXT,
  status VARCHAR DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 提案明細
CREATE TABLE IF NOT EXISTS proposal_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT,
  status VARCHAR,
  service_name VARCHAR,
  service_id UUID REFERENCES services(id),
  contact_name VARCHAR,
  contact_id UUID REFERENCES contacts(id),
  company_name VARCHAR,
  deal_title VARCHAR,
  deal_id UUID REFERENCES deals(id),
  memo TEXT,
  service_price_auto INTEGER,
  service_price_manual INTEGER,
  quantity INTEGER DEFAULT 1,
  calculated_price INTEGER,
  calculated_total INTEGER,
  email_text TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by VARCHAR
);

-- RLS + open policies
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll ENABLE ROW LEVEL SECURITY;
ALTER TABLE paid_leave_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE paid_leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposal_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all" ON employees FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON attendance_records FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON daily_attendance FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON payroll FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON paid_leave_ledger FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON paid_leave_requests FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON proposal_details FOR ALL USING (true) WITH CHECK (true);
