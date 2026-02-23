import { IsBoolean, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ConfirmSuggestionDto {
    @ApiProperty({
        description: 'Whether the farmer accepts or declines the suggested alternate date',
        example: true
    })
    @IsBoolean()
    @IsNotEmpty()
    accept: boolean;
}
