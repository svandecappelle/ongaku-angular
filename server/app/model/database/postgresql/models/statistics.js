
"use strict";

module.exports = function(sequelize, DataTypes) {
    var Statistics = sequelize.define("Statistics", {
        name: {
            type: DataTypes.STRING,
            primaryKey: true
        },
        concern: DataTypes.STRING,
        value: DataTypes.STRING,
        owner: {
            type: DataTypes.INTEGER,
            references: {
                model: 'User', // Can be both a string representing the table name, or a reference to the model
                key:   "id"
            }
        },
    }, {
        tableName: 'statistics',
        timestamps: true, // don't add the timestamp attributes (updatedAt, createdAt)
        underscored: true // transform the columns camelCase into underscored table_name.
    });

    return Statistics;
};