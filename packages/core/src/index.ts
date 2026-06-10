/**
 * @seedoffice/core — โดเมนล้วน (pure function, ไม่ผูก HTTP/DB)
 * กติกา (SPEC §9): เงิน = integer สตางค์ · เวลา = integer นาที · ห้าม float กับเงิน
 * การปัดเศษเงินอยู่ที่เดียวคือ money.ts (ครึ่งปัดขึ้นที่หน่วยสตางค์)
 */
export * from './constants'
export * from './money'
export * from './cycle'
export * from './time'
export * from './format'
export * from './crm'
