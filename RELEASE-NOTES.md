# RentDesk — Customer creation and inventory fixes

- Sign Out now clears local UI state even if the optional server-side session cleanup fails.
- Creating a customer waits for all selected customer/ID photos to finish uploading. A failed upload must be retried or removed before creation. The submit button is disabled during photo upload.
- Profession is mandatory in the Start Rental new-customer form and validated again in the customer creation API. Selecting Other requires specifying the profession.
- Product Wise and Machine Wise inventory tabs show 15 entries per page. Search/filter changes reset pagination.
- Removed the requested supporting copy without changing transaction calculations.

## Testing before deployment

1. Sign in, Sign Out, and verify the login screen appears even if the network is interrupted.
2. Upload a large image while creating a customer and immediately press Create: customer must not be created until upload finishes. Test failed uploads too.
3. Create customer without Profession: blocked. With Other and empty custom profession: blocked.
4. Create 16+ products and machines and test both pagination controls, search and filters.
5. Verify private R2 photo display after reload and test on Vercel staging.

This update does not modify the database schema. Existing browser and production integrations were not exercised in this environment.
