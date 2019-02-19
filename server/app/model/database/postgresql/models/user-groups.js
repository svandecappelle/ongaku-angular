"use strict";

module.exports = function(sequelize, DataTypes) {
  var UserGroups = sequelize.define("UserGroups", {
    user_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      reference: {
        model: 'User',
        key: 'id'
      }
    },
    group_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      references: {
        model: 'Group',
        key: 'id'
      }
    }
  }, {
    underscored: true, // transform the columns camelCase into underscored table_name.
    tableName: 'user_groups',
    freezeTableName: true
  });
  return UserGroups;
};
