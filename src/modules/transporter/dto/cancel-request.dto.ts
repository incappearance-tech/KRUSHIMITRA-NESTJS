import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CancelRequestDto {
    @ApiProperty({
        description: 'Reason for cancellation',
        example: 'Change of plans'
    })
    @IsString()
    @IsNotEmpty()
    reason: string;
}
