/**
 * Removes old columns from `orders`.
 * knex runs migrations in alphabetical order, so on a fresh install this file runs before
 * `orders_table.js`. It only drops what actually exists.
 * @param { import("knex").Knex } knex
 */
exports.up = async function(knex) {
    if (!(await knex.schema.hasTable('orders'))) return;
    for (const column of ['ref_no', 'pos_shop', 'receipt_number', 'customer_id']) {
        if (await knex.schema.hasColumn('orders', column)) {
            await knex.schema.alterTable('orders', table => table.dropColumn(column));
        }
    }
};

exports.down = async function(knex) {
    if (!(await knex.schema.hasTable('orders'))) return;
    await knex.schema.alterTable('orders', function(table) {
        table.string('ref_no');
        table.string('pos_shop');
        table.string('receipt_number');
        table.bigInteger('customer_id');
    });
};
