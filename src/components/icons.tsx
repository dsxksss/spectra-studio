
import {
    siPostgresql,
    siRedis,
    siMysql,
    siMongodb,
    siSqlite,
    siMariadb,
    siElasticsearch,
} from 'simple-icons';

// Helper function to create icon component from simple-icons
const createIconComponent = (icon: { path: string; title: string }) => {
    return ({ size = 20, className = "" }: { size?: number; className?: string }) => (
        <svg
            width={size}
            height={size}
            className={className}
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
            fill="currentColor"
            aria-label={icon.title}
        >
            <path d={icon.path} />
        </svg>
    );
};

// Export database icon components
export const PostgresIcon = createIconComponent(siPostgresql);
export const RedisIcon = createIconComponent(siRedis);
export const MySQLIcon = createIconComponent(siMysql);
export const MongoIcon = createIconComponent(siMongodb);
export const MongoIconSingle = createIconComponent(siMongodb);
export const SQLiteIcon = createIconComponent(siSqlite);

// Additional database icons (available for future use)
export const MariaDBIcon = createIconComponent(siMariadb);
export const ElasticsearchIcon = createIconComponent(siElasticsearch);
