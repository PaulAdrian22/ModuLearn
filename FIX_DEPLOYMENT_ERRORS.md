# Fix for Simulation Creation & Forgot Password Errors

## Problems Identified

1. **Simulation Creation Error**: `ER_NO_DEFAULT_FOR_FIELD`
   - Root cause: Database schema has `ModuleID`, `Description`, `Instructions` as NOT NULL without defaults
   - Frontend/admin can't create simulations

2. **Forgot Password Error**: `Failed to submit request. Please try again.`
   - Root cause: CREATE TABLE query using wrong parameters with `query()` helper

## Solutions Applied

### 1. Database Schema Consistency (CRITICAL)

**Changed in:**
- `database/add_simulation_table.sql`
- `backend/routes/adminRoutes.js` (ensureSimulationTable function)

**From:**
```sql
ModuleID INT NOT NULL            -- ❌ No default!
Description TEXT                 -- ❌ Can be NULL issues
Instructions TEXT                -- ❌ Can be NULL issues
```

**To:**
```sql
ModuleID INT DEFAULT 0           -- ✅ Has default
Description TEXT DEFAULT ''      -- ✅ Has default
Instructions TEXT DEFAULT ''     -- ✅ Has default
```

### 2. Improved Simulation Insertion Logic

**Changed in:**
- `backend/controllers/simulationController.js` (createSimulation function)

**Improvements:**
- Always include required columns in payload
- More explicit DEFAULT handling
- Better handling of undefined vs null values
- Ensures Description & Instructions never missing

### 3. Fixed Forgot Password Endpoint

**Changed in:**
- `backend/routes/authRoutes.js`

**Improvements:**
- Uses `pool.query()` directly for DDL (CREATE TABLE)
- Better error handling and logging
- Won't crash if table already exists
- Graceful fallback continues execution

## Required Actions on Deployed

### Step 1: Run Migration on Deployed Database

Execute this script on your deployed database:
```sql
-- See file: database/fix_simulation_schema_defaults.sql
```

This will:
- Add DEFAULT values to existing columns
- Fix any NULL values in database
- Ensure password_reset_requests table exists
- Verify the fixes

### Step 2: Restart Azure Backend

1. Go to Azure Portal
2. Find `modulearn-api-260412162638` App Service
3. Click **Restart**
4. Wait 30-60 seconds

### Step 3: Verify Fixes

Test:
- [x] Forgot Password - should submit without error
- [x] Create Simulation - should create successfully
- [x] All existing simulations still work

## What Was Fixed

| Issue | Cause | Fix |
|-------|-------|-----|
| Simulation creation fails | ModuleID NOT NULL without default | Added DEFAULT 0 |
| Forgot password fails | Wrong query params for CREATE TABLE | Use pool.query() directly |
| Field validation | Missing error handling | Improved error logging |

## Files Modified

- `backend/routes/authRoutes.js` - Password reset endpoint improvements
- `backend/controllers/simulationController.js` - Better simulation insertion
- `database/add_simulation_table.sql` - Schema with proper defaults
- `backend/routes/adminRoutes.js` - ensureSimulationTable with defaults
- `database/fix_simulation_schema_defaults.sql` - Migration script (new)
