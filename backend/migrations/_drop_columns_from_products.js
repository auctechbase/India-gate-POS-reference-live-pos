/**
 * Historical migration: it targets `orders` (not `products`) and the columns never existed there.
 * Kept because existing installs have it recorded in knex_migrations; it is a no-op when the
 * columns are missing.
 * @param { import("knex").Knex } knex
 */
exports.up = async function(knex) {
    if (!(await knex.schema.hasTable('orders'))) return;
    for (const column of ['type', 'weight']) {
        if (await knex.schema.hasColumn('orders', column)) {
            await knex.schema.alterTable('orders', table => table.dropColumn(column));
        }
    }
};

exports.down = async function() {};
