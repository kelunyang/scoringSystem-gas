-- Migration: Add maxVoteResetCount to projects table
-- This field allows configuring the maximum number of times a group leader
-- can reset votes per stage. Default is 1 for backward compatibility.

ALTER TABLE projects ADD COLUMN maxVoteResetCount INTEGER DEFAULT 1;
