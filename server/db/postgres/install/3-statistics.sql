CREATE TABLE statistics (
    name varchar(255) not null,
    value varchar(255) NOT NULL,
    concern varchar(255),
    owner integer REFERENCES users(id),
	created_at timestamp,
	updated_at timestamp,
	deleted_at timestamp
);

CREATE UNIQUE INDEX "statistics_unique_by_concern" ON statistics (name, concern);