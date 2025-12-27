-- Move pgvector extension out of public schema (security linter)
ALTER EXTENSION vector SET SCHEMA extensions;