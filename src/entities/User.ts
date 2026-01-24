import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany, ManyToOne } from "typeorm";
import { Service } from "./Service";
import { Booking } from "./Booking";
import { City } from "./City";
import { RefreshToken } from "./RefreshToken";

export enum UserRole {
  SEEKER = 'seeker',       // Default user role
  PROVIDER = 'provider',   // Service provider
  BOTH = 'both',          // Both seeker and provider
  MODERATOR = 'moderator', // Can review content
  ADMIN = 'admin'         // Full system access
}

@Entity()
export class User {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ unique: true })
  email: string;

  @Column()
  password: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ type: "text", nullable: true })
  bio: string;

  @Column({
    type: "simple-enum",
    enum: UserRole,
    default: UserRole.SEEKER
  })
  role: UserRole;

  @Column({ nullable: true })
  cityId: string;

  @ManyToOne(() => City, city => city.users, { nullable: true })
  city: City;

  @Column('decimal', { precision: 10, scale: 7, nullable: true })
  latitude: number;

  @Column('decimal', { precision: 10, scale: 7, nullable: true })
  longitude: number;

  @Column({ nullable: true, type: 'varchar' })
  avatar: string | null;

  @Column({ default: false })
  verified: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => Service, service => service.provider)
  services: Service[];

  @OneToMany(() => Booking, booking => booking.seeker)
  bookingsAsSeeker: Booking[];

  @OneToMany(() => Booking, booking => booking.provider)
  bookingsAsProvider: Booking[];

  @OneToMany(() => RefreshToken, token => token.user)
  refreshTokens: RefreshToken[];
}
