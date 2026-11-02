// Creates `orders` with its current columns. Older installs got the same result through
// `_drop_columns_from_orders.js` and `add_cash_register_id_to_orders_table.js`, which run before
// this file alphabetically and therefore do nothing on a fresh install.
exports.up = async function (knex) {
    if (await knex.schema.hasTable('orders')) return;
    await knex.schema.createTable('orders', (table) => {
        table.increments('id').primary(); // Auto-incrementing ID
        table.bigInteger('cashier_id');
        table.string('amount').nullable();
        table.string('session_id').nullable();
        table.string('payment_mode').defaultTo('cash');
        table.string('transaction_type').defaultTo('cash');
        table.bigInteger('cash_register_id').nullable();
        table.timestamps(true,true);
    });
};

exports.down = async function (knex) {
    await knex.schema.dropTableIfExists('orders');
};
