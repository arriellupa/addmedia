-- where a summary comes from: the student's own words, or a lesson presentation the students received
ALTER TABLE campus_docs ADD COLUMN source TEXT NOT NULL DEFAULT 'own';
