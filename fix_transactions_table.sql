-- Fix transactions table by adding missing columns
-- Run this script on your database before starting the application

USE `c372-005_team3`;

-- Add captureId column if it doesn't exist
ALTER TABLE transactions 
ADD COLUMN captureId VARCHAR(255) DEFAULT NULL;

-- Add refundReason column if it doesn't exist
ALTER TABLE transactions 
ADD COLUMN refundReason VARCHAR(255) DEFAULT NULL;

-- Verify the changes
DESCRIBE transactions;
