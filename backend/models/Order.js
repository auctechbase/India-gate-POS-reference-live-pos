const { Model } = require('objection');
const CashRegister = require('./CashRegister');

class Order extends Model {

    static get tableName() {
        return 'orders'; // Corresponds to the table name in your database
    }
  
    static get relationMappings() {
        const Customer = require('./Customer');
        const CashierSession = require('./CashierSession');
        const User = require('./User');

        return {
            customer: {
                relation: Model.BelongsToOneRelation,
                modelClass: Customer,
                join: {
                    from: 'orders.customer_id',
                    to: 'customers.id',
                },
            },
            cashier: {
                relation: Model.BelongsToOneRelation,
                modelClass: User,
                join: {
                    from: 'orders.cashier_id',
                    to: 'users.id'
                }
            },
            // The session row written for this order (not just any session of the same register).
            session: {
                relation: Model.HasOneRelation,
                modelClass: CashierSession,
                join: {
                    from: 'orders.id',
                    to: 'cashier_sessions.order_id'
                }
            },
            register: {
                relation : Model.BelongsToOneRelation,
                modelClass: CashRegister,
                join: {
                    from: 'orders.cash_register_id',
                    to: "cash_register.id"
                }
            }
        };
    }
}

module.exports = Order;

